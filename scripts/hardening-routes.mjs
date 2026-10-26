import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import ts from 'typescript';

const methods = new Set(['get', 'post', 'put', 'patch', 'delete', 'head', 'options']);

function visit(node, callback) {
  callback(node);
  ts.forEachChild(node, (child) => visit(child, callback));
}

function definitions(file, cache) {
  if (cache.has(file)) return cache.get(file);
  const source = readFileSync(file, 'utf8');
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const names = new Map();
  cache.set(file, { syntax, names });
  for (const statement of syntax.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name)
      names.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        if (ts.isIdentifier(declaration.name))
          names.set(declaration.name.text, declaration.initializer);
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const target = resolve(
        dirname(file),
        statement.moduleSpecifier.text.replace(/\.js$/u, '.ts'),
      );
      if (!existsSync(target)) continue;
      for (const item of statement.importClause?.namedBindings?.elements ?? [])
        names.set(item.name.text, { imported: item.propertyName?.text ?? item.name.text, target });
    }
  }
  visit(syntax, (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer)
      names.set(node.name.text, node.initializer);
  });
  return { syntax, names };
}

function guardKind(file, name, cache, seen = new Set()) {
  const identity = `${file}:${name}`;
  if (seen.has(identity)) return undefined;
  seen.add(identity);
  const entry = definitions(file, cache).names.get(name);
  if (!entry) return undefined;
  if ('imported' in entry) return guardKind(entry.target, entry.imported, cache, seen);
  if (ts.isIdentifier(entry)) return guardKind(file, entry.text, cache, seen);
  const body = entry.getText(definitions(file, cache).syntax);
  const checksSession =
    /\.api\.getSession\s*\(/u.test(body) && /if\s*\(\s*!\s*\w+\?\.user\?\.id/u.test(body);
  if (checksSession && /findActiveAdminContext\s*\(/u.test(body)) {
    if (/requiredCapability\s*=\s*['"][^'"]+['"]/u.test(body)) return 'default-capability';
    return /requiredCapability/u.test(body) ? 'capability' : 'membership';
  }
  if (name === 'requireUserSession' && checksSession) return 'session';
  return undefined;
}

function handlerText(file, node, cache) {
  if (!node) return '';
  if (ts.isIdentifier(node)) {
    const definition = definitions(file, cache).names.get(node.text);
    return definition && !('imported' in definition)
      ? definition.getText(definitions(file, cache).syntax)
      : '';
  }
  const handler = node.getText(definitions(file, cache).syntax);
  let body = handler;
  const dependencies = [];
  const seen = new Set();
  for (let depth = 0; depth < 3; depth += 1) {
    const names = [...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/gu)].map((match) => match[1]);
    let expanded = false;
    for (const name of names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const definition = definitions(file, cache).names.get(name);
      if (!definition || 'imported' in definition || ts.isIdentifier(definition)) continue;
      const text = definition.getText(definitions(file, cache).syntax);
      if (text.includes('findActiveAdminContext')) continue;
      dependencies.push(text);
      body += `\n${text}`;
      expanded = true;
    }
    if (!expanded) break;
  }
  return `const __handler = ${handler};\n${dependencies.join(';\n')}`;
}

export function checkAdminRoutes(files) {
  const failures = [];
  const cache = new Map();
  let count = 0;
  for (const file of files) {
    const { syntax } = definitions(file, cache);
    visit(syntax, (node) => {
      if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
      if (!methods.has(node.expression.name.text) || !ts.isStringLiteral(node.arguments[0])) return;
      const route = node.arguments[0].text;
      if (!route.startsWith('/admin/')) return;
      count += 1;
      const handler = handlerText(file, node.arguments.at(-1), cache);
      const guardCalls = [];
      const handlerSyntax = ts.createSourceFile(
        'handler.ts',
        handler,
        ts.ScriptTarget.Latest,
        true,
      );
      visit(handlerSyntax, (part) => {
        if (ts.isCallExpression(part) && ts.isIdentifier(part.expression)) {
          const kind = guardKind(file, part.expression.text, cache);
          if (kind) {
            let parent = part.parent;
            while (parent && !ts.isVariableDeclaration(parent)) parent = parent.parent;
            const variable = parent && ts.isIdentifier(parent.name) ? parent.name.text : undefined;
            const rejected =
              variable &&
              new RegExp(
                `if\\s*\\(\\s*(?:!\\s*${variable}\\b|${variable}\\.error\\b|!\\s*${variable}\\.ok\\b|[\\x27"]error[\\x27"]\\s+in\\s+${variable}\\b)`,
                'u',
              ).test(handler);
            const inlineReject = new RegExp(
              `if\\s*\\(\\s*!\\s*\\(\\s*await\\s+${part.expression.text}\\s*\\(`,
              'u',
            ).test(handler);
            if (rejected || inlineReject)
              guardCalls.push({ kind, hasCapabilityArgument: part.arguments.length >= 4 });
          }
        }
      });
      const direct =
        /\.api\.getSession\s*\(/u.test(handler) && /findActiveAdminContext\s*\(/u.test(handler);
      const selfService =
        route.startsWith('/admin/account') && guardCalls.some((g) => g.kind === 'session');
      const membership = route === '/admin/context' && direct;
      const capability =
        guardCalls.some(
          (g) =>
            g.kind === 'default-capability' || (g.kind === 'capability' && g.hasCapabilityArgument),
        ) ||
        (guardCalls.some((g) => g.kind === 'capability') && /hasInboxAccess\s*\(/u.test(handler)) ||
        (guardCalls.some((g) => g.kind === 'capability') &&
          /^\/admin\/messaging\/(?:availability\/me(?:\/heartbeat)?|notification-preferences)$/u.test(
            route,
          ) &&
          /(?:actor\(context\)|context\.membershipId)/u.test(handler)) ||
        (route.startsWith('/admin/security/two-factor/') &&
          guardCalls.some((g) => g.kind === 'capability'));
      if (!selfService && !membership && !capability) {
        const line = syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1;
        failures.push(
          `${file}:${line}: ${route} lacks a verified per-handler authorization boundary`,
        );
      }
    });
  }
  return { failures, count };
}

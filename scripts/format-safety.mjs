import ts from 'typescript';

function syntax(node) {
  if (ts.isParenthesizedExpression(node)) return syntax(node.expression);
  const children = [];
  ts.forEachChild(node, (child) => {
    children.push(syntax(child));
  });
  return {
    kind: node.kind,
    ...((ts.isLiteralExpression(node) || ts.isTemplateLiteralToken(node)) &&
    typeof node.text === 'string'
      ? { text: node.text }
      : {}),
    ...(ts.isIdentifier(node) ? { name: node.text } : {}),
    ...(typeof node.operator === 'number' ? { operator: node.operator } : {}),
    ...(ts.isVariableDeclarationList(node)
      ? { declarationKind: node.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let) }
      : {}),
    children,
  };
}

function compiledSyntax(source, file) {
  const output = ts.transpileModule(source, {
    fileName: file,
    compilerOptions: {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      jsx: ts.JsxEmit.ReactJSX,
      removeComments: true,
    },
    reportDiagnostics: true,
  });
  if (output.diagnostics?.some((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error))
    throw new Error(`Cannot establish formatter safety for ${file}: compiler diagnostic.`);
  return syntax(
    ts.createSourceFile('formatted.js', output.outputText, ts.ScriptTarget.Latest, true),
  );
}

function templates(source, file) {
  const root = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const values = [];
  const visit = (node) => {
    if (ts.isTemplateLiteralToken(node)) values.push(node.rawText ?? node.text);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return values;
}

/** Conservative review aid, not a proof of every possible runtime equivalence. */
export function reviewFormatting(before, after, file) {
  const templateBytesEqual =
    JSON.stringify(templates(before, file)) === JSON.stringify(templates(after, file));
  const runtimeSyntaxEqual =
    JSON.stringify(compiledSyntax(before, file)) === JSON.stringify(compiledSyntax(after, file));
  return { templateBytesEqual, runtimeSyntaxEqual, safe: templateBytesEqual && runtimeSyntaxEqual };
}

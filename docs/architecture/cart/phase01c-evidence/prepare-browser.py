from pathlib import Path
for old in Path('scripts').glob('cart-phase01br-*'):
 new=old.with_name(old.name.replace('phase01br','phase01c'))
 assert not new.exists(), new
 source=old.read_text().replace('docs/architecture/cart/phase01br-evidence/', '/tmp/maevelle-cart01c/').replace('/tmp/maevelle-cart01br','/tmp/maevelle-cart01c').replace('55443','55444').replace('CART_01BR_ISOLATED_URL','CART_01C_ISOLATED_URL')
 new.write_text(source)

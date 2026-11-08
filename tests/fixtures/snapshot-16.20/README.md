# Historical public-data fixtures

These immutable 16.20 snapshots preserve the reviewed rule, permission, combat and upgrade contracts. They are regression inputs, not current game advice. Current 4.0 tests use the 16.21 bundle or independently sourced 16.21 fixtures. The package script excludes the entire tests directory. No player records, account data or settings are included.

The matching catalog.json is copied byte-for-byte from the same source commit. Its separate catalog-provenance.json records the original path and SHA-256. Tests select historical configurations explicitly; these bindings do not define current automatic defaults.

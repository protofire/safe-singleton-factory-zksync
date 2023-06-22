# Safe Singleton Factory for zkSync

Singleton factory used by Safe related contracts for deploying on zkSync, based on https://github.com/safe-global/safe-singleton-factory 

# To compile for zkSync
- Set `RPC ` in the `.env` file
- Set `MNEMONIC` or `PK` in the `.env` file
- Run `yarn compile`

# To submit deployment transaction for zkSync
- Run `yarn submit`
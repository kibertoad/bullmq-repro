# Reproduction instructions

```shell
npm install
```

```shell
npm run docker:start:dev
```

```shell
npm run test
```

Test will fail with the following error:
```
Validation error, cannot resolve alias "dts"
 ❯ node_modules/cron-parser/lib/expression.js:169:17
 ❯ Function._parseField node_modules/cron-parser/lib/expression.js:163
```

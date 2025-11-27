<!-- STEP I -->
npm init -y
<!-- STEP II -->
npm i bcrypt dot env express jsonwebtoken prisma uuid zod
<!-- STEP III -->
npm i @prisma/client
<!-- step IV -->
npm i @types/bcrypt -D
npm i @types/express -D
npm i @types/jsonwebtoken -D
npm i @types/node -D
npm i @types/uuid -D
npm i nodemon -D
npm i ts-node -D
npm i typescript -D
<!-- STEP V -->
didalam ts config paste ini
1. "include": ["src/**/*"],
2. uncomment yang outdir
3. terus ganti module dan target jadi
4. "module": "commonjs",
5. "target": "es2016",
6. comment "sourceMap": true, "declaration": true, "declarationMap": true,
7, comment "noUncheckedIndexedAccess": true, "exactOptionalPropertyTypes": true,
8. comment "jsx": "react-jsx", "verbatimModuleSyntax": true, "isolatedModules": true, "noUncheckedSideEffectImports": true, "moduleDetection": "force",
9. tambahi "esModuleInterop": true, "forceConsistentCasingInFileNames": true diakhir
<!-- STEP VI -->
npx prisma init
<!-- STEP VII -->
masukan ini ke schema
generator client {
  provider = "prisma-client-js"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id       Int    @id @default(autoincrement())
  username String @db.VarChar(100)
  email    String @unique @db.VarChar(150)
  password String @db.VarChar(100)

  todos Todo[]

  @@map("users")
}

model Todo {
  id          Int    @id @default(autoincrement())
  title       String @db.VarChar(100)
  description String @db.Text
  priority    String @db.VarChar(10)
  due_date    String @db.VarChar(100)
  status      String @db.VarChar(20)

  user_id Int

  user User @relation(fields: [user_id], references: [id], onDelete: Cascade, onUpdate: Cascade)

  @@map("todos")
}
<!-- FINAL -->
tambahi itu dalam package.json script
"dev": "nodemon src/main.ts",# alp_visual_programming_backend

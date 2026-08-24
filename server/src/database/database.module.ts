import { Global, Module } from '@nestjs/common';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

/**
 * A single pg Pool shared across the app. Raw SQL over an ORM: the queries here
 * are index-sensitive (GiST KNN, prefix btree) and worth keeping visible.
 */
@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 10,
        }),
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}

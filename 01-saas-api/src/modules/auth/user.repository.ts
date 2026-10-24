import { type PoolClient } from "pg";
import { pool } from "../../config/database";

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  is_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserInput {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
}

export class UserRepository {
  /**
   * Finds a user by email using the lowercase index.
   */
  async findByEmail(email: string, client?: PoolClient): Promise<UserRecord | null> {
    const query = `
      SELECT id, email, password_hash, full_name, is_verified, created_at, updated_at
      FROM users
      WHERE LOWER(email) = LOWER($1)
      LIMIT 1;
    `;
    const db = client ?? pool;
    const result = await db.query<UserRecord>(query, [email]);
    return result.rows[0] ?? null;
  }

  /**
   * Finds a user by primary key UUID.
   */
  async findById(id: string, client?: PoolClient): Promise<UserRecord | null> {
    const query = `
      SELECT id, email, password_hash, full_name, is_verified, created_at, updated_at
      FROM users
      WHERE id = $1
      LIMIT 1;
    `;
    const db = client ?? pool;
    const result = await db.query<UserRecord>(query, [id]);
    return result.rows[0] ?? null;
  }

  /**
   * Inserts a new user record into PostgreSQL.
   */
  async create(input: CreateUserInput, client?: PoolClient): Promise<UserRecord> {
    const query = `
      INSERT INTO users (id, email, password_hash, full_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, password_hash, full_name, is_verified, created_at, updated_at;
    `;
    const db = client ?? pool;
    const values = [
      input.id,
      input.email.toLowerCase(),
      input.password_hash,
      input.full_name,
    ];

    const result = await db.query<UserRecord>(query, values);
    const row = result.rows[0];

    if (!row) {
      throw new Error("Failed to insert user record into PostgreSQL");
    }

    return row;
  }
}

export const userRepository = new UserRepository();

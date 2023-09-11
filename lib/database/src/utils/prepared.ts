import type { Database, Statement } from "@aidenlx/better-sqlite3";

export abstract class PreparedBase<Input, OutputSql, Output = OutputSql[]> {
  protected statement: Statement;
  abstract sql(): string;
  constructor(database: Database) {
    this.statement = database.prepare(this.sql());
  }
  protected get database(): Database {
    return this.statement.database;
  }

  protected get(input: Input): OutputSql | null {
    return this.statement.get(input);
  }
  protected all(input: Input): OutputSql[] {
    if (input === undefined) return this.statement.all();
    return this.statement.all(input);
  }

  abstract query(...args: any[]): Output;
}

export interface PreparedBaseCtor {
  new (database: Database): PreparedBase<any, any, any>;
}

export abstract class Prepared<Output, Input> extends PreparedBase<
  Input,
  Output
> {
  query(input: Input): Output[] {
    return this.all(input);
  }
}

export abstract class PreparedNoInput<Output> extends PreparedBase<
  undefined,
  Output
> {
  query(): Output[] {
    return this.all(undefined);
  }
}

export abstract class PreparedWithParser<
  OutputSql,
  Output,
  Input = undefined,
> extends PreparedBase<Input, OutputSql, Output[]> {
  protected abstract parse(
    output: OutputSql,
    input: Input,
    ...extra: any[]
  ): Output;
  query(input: Input): Output[] {
    return this.all(input).map((output) => this.parse(output, input));
  }
}

import { genres } from './catalog';
import { ApolloServer } from '@apollo/server';
import { GraphQLError, type ValidationContext } from 'graphql';
import { DomainError } from './model';
import type { Service } from './service';
type Context = { service: Service; workspace: string; role: string };
export const contextFor = (service: Service, workspace: string, role: string): Context => ({
  service,
  workspace,
  role,
});
export function createApi() {
  return new ApolloServer<Context>({
    includeStacktraceInErrorResponses: false,
    typeDefs: `#graphql
 enum WatchState { PLANNED WATCHING FINISHED REMOVED }
 type Entry {titleId:ID!,state:WatchState!,rating:Int,note:String!,version:Int!,updatedAt:String!,finishedAt:String}
 type Title {id:ID!,name:String!,genre:String!,year:Int!,minutes:Int!,director:String!,description:String!,tagline:String!,palette:String!,motif:Int!,watch:Entry}
 type LibraryEntry {titleId:ID!,state:WatchState!,rating:Int,note:String!,version:Int!,updatedAt:String!,finishedAt:String,title:Title!}
 type Edge {node:Title!,cursor:String!}
 type PageInfo {endCursor:String,hasNextPage:Boolean!}
 type Connection {edges:[Edge!]!,totalCount:Int!,pageInfo:PageInfo!}
 type Query {browse(search:String,genre:String,sort:String,first:Int,after:String):Connection!,library:[LibraryEntry!]!,genres:[String!]!}
 input SaveInput {state:WatchState!,rating:Int,note:String!}
 type Mutation {save(titleId:ID!,version:Int!,input:SaveInput!):Entry!}
`,
    validationRules: [
      (c: ValidationContext) => {
        let fields = 0;
        return {
          Field() {
            if (++fields === 151) c.reportError(new GraphQLError('Maximum 150 fields.'));
          },
          FragmentDefinition() {
            c.reportError(new GraphQLError('Fragments are disabled in this bounded demo.'));
          },
          OperationDefinition(n) {
            if (n.operation === 'mutation' && n.selectionSet.selections.length > 1)
              c.reportError(new GraphQLError('One mutation field per request.'));
          },
        };
      },
    ],
    resolvers: {
      Query: {
        genres: () => genres,
        browse: (
          _: unknown,
          args: { search?: string; genre?: string; sort?: string; first?: number; after?: string },
          c: Context,
        ) => c.service.browse(c.workspace, args),
        library: (_: unknown, __: unknown, c: Context) => c.service.library(c.workspace),
      },
      Mutation: {
        save: (_: unknown, a: { titleId: string; version: number; input: unknown }, c: Context) =>
          c.service.save(c.workspace, c.role, a.titleId, a.version, a.input),
      },
    },
    formatError: (formatted, error) => {
      const original = error instanceof GraphQLError ? error.originalError : null;
      if (original instanceof DomainError)
        return { message: original.message, extensions: { code: original.code } };
      if (formatted.extensions?.code === 'INTERNAL_SERVER_ERROR') {
        console.error(error);
        return {
          message: 'Unable to complete this operation.',
          extensions: { code: 'INTERNAL_SERVER_ERROR' },
        };
      }
      return formatted;
    },
  });
}

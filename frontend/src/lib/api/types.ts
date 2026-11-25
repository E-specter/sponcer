import type { z } from 'zod';
import type { Api, EndpointName } from '@sponcer/contracts';

type PathParams<P extends string> = P extends `${string}:${infer K}/${infer R}`
  ? K | PathParams<R>
  : P extends `${string}:${infer K}`
    ? K
    : never;

export type ParamKeys<N extends EndpointName> = PathParams<Api[N]['path']>;

type Part<
  N extends EndpointName,
  K extends 'query' | 'body',
  Dir extends 'input' | 'output',
> = Api[N] extends { [P in K]: infer S extends z.ZodType }
  ? { [P in K]: Dir extends 'input' ? z.input<S> : z.output<S> }
  : unknown;

type ParamsPart<N extends EndpointName> = [ParamKeys<N>] extends [never]
  ? unknown
  : { params: Record<ParamKeys<N>, string> };

/** Argumentos que acepta el cliente (entrada de los esquemas). */
export type CallArgs<N extends EndpointName> = ParamsPart<N> &
  Part<N, 'query', 'input'> &
  Part<N, 'body', 'input'>;

/** Argumentos ya validados que reciben las implementaciones (salida de los esquemas). */
export type ParsedArgs<N extends EndpointName> = ParamsPart<N> &
  Part<N, 'query', 'output'> &
  Part<N, 'body', 'output'>;

export type Result<N extends EndpointName> = z.output<Api[N]['response']>;

// `{}` extends A significa "A no tiene claves obligatorias".
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type ArgsTuple<A> = {} extends A ? [args?: A] : [args: A];

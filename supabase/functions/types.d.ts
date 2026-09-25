// Заглушки для редактора TypeScript. При переходе на Deno исключите этот файл, чтобы не дублировать типы Deno.

declare module 'npm:*'
declare module 'jsr:*'
declare module 'https://*'

declare namespace Deno {
  const env: {
    get(key: string): string | undefined
    set(key: string, value: string): void
  }
  function serve(
    handler: (request: Request) => Response | Promise<Response>,
  ): void
}

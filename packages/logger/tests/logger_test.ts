import { assertEquals } from 'jsr:@std/assert@0.205.0';
import { assertSpyCall, spy } from 'jsr:@std/testing@0.205.0/mock';
import { create_logger, LogLevel, type LoggerTransport } from '../mod.ts';

Deno.test('Logger - Basic Logging', () => {
  const transport = spy((_lvl: LogLevel, _data: Record<string, any>, _meta: Record<string, any>) => {});
  const logger = create_logger({
    transport: transport as unknown as LoggerTransport,
    format_error: (e) => e,
    level: LogLevel.info,
  });

  logger.info({ msg: 'hello' });
  assertSpyCall(transport, 0, {
    args: [LogLevel.info, { msg: 'hello' }, {}],
  });
});

Deno.test('Logger - Level Filtering', () => {
  const transport = spy((_lvl: LogLevel, _data: Record<string, any>, _meta: Record<string, any>) => {});
  const logger = create_logger({
    transport: transport as unknown as LoggerTransport,
    format_error: (e) => e,
    level: LogLevel.error, // Only error, alert, emergency
  });

  logger.info({ msg: 'ignored' });
  logger.error({ msg: 'shown' });

  assertEquals(transport.calls.length, 1);
  assertSpyCall(transport, 0, {
    args: [LogLevel.error, { msg: 'shown' }, {}],
  });
});

Deno.test('Logger - Metadata', () => {
  const transport = spy((_lvl: LogLevel, _data: Record<string, any>, _meta: Record<string, any>) => {});
  const logger = create_logger({
    transport: transport as unknown as LoggerTransport,
    format_error: (e) => e,
    level: LogLevel.info,
  });

  logger.upd_meta({ requestId: '123' });
  logger.info({ msg: 'test' });

  assertSpyCall(transport, 0, {
    args: [LogLevel.info, { msg: 'test' }, { requestId: '123' }],
  });
});

Deno.test('Logger - Cloning', () => {
  const transport = spy((_lvl: LogLevel, _data: Record<string, any>, _meta: Record<string, any>) => {});
  const logger = create_logger({
    transport: transport as unknown as LoggerTransport,
    format_error: (e) => e,
    level: LogLevel.info,
  });

  logger.upd_meta({ root: true });
  const child = logger.clone();
  child.upd_meta({ child: true });

  logger.info({ msg: 'parent' });
  child.info({ msg: 'child' });

  // Parent should not have child meta
  assertSpyCall(transport, 0, {
    args: [LogLevel.info, { msg: 'parent' }, { root: true }],
  });

  // Child should have both
  assertSpyCall(transport, 1, {
    args: [LogLevel.info, { msg: 'child' }, { root: true, child: true }],
  });
});

Deno.test('Logger - Stack/Code', () => {
  const transport = spy((_lvl: LogLevel, _data: Record<string, any>, _meta: Record<string, any>) => {});
  const logger = create_logger({
    transport: transport as unknown as LoggerTransport,
    format_error: (e) => e,
    level: LogLevel.info,
  });

  logger.stack('api');
  logger.stack('user');
  logger.info({ msg: 'test' });
  
  assertSpyCall(transport, 0, {
    args: [LogLevel.info, { msg: 'test', code: 'api.user' }, {}],
  });

  // Test appending to existing code in data
  logger.info({ msg: 'test2', code: 'validation' });
  assertSpyCall(transport, 1, {
    args: [LogLevel.info, { msg: 'test2', code: 'api.user.validation' }, {}],
  });
});

Deno.test('Logger - Async Context (Cast)', async () => {
  const transport = spy((_lvl: LogLevel, _data: Record<string, any>, _meta: Record<string, any>) => {});
  const logger = create_logger({
    transport: transport as unknown as LoggerTransport,
    format_error: (e) => e,
    level: LogLevel.info,
  });

  logger.upd_meta({ id: 'root' });

  await logger.cast(async (l) => {
    l.upd_meta({ id: 'child' }); // Should only affect this context
    l.info({ msg: 'inside' });
    
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 1));
    l.info({ msg: 'inside_after' });
  });

  logger.info({ msg: 'outside' });

  // 1. Inside
  assertSpyCall(transport, 0, {
    args: [LogLevel.info, { msg: 'inside' }, { id: 'child' }],
  });
  
  // 2. Inside after await
  assertSpyCall(transport, 1, {
    args: [LogLevel.info, { msg: 'inside_after' }, { id: 'child' }],
  });

  // 3. Outside - should revert to root
  assertSpyCall(transport, 2, {
    args: [LogLevel.info, { msg: 'outside' }, { id: 'root' }],
  });
});

/**
 * Tests for lib-two module sharing with lib-two-required-layer configurations
 */

it('should consume lib-two v1.3.4 from lib-two-required-layer with eager loading', async () => {
  const { version, layer } = await import('lib2');
  expect(version).toBe('1.3.4');
  expect(layer).toBe('differing-layer'); // Using the layer from different-layer-loader
});

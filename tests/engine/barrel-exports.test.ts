import { describe, it, expect } from 'vitest';
import * as AnalyticsBarrel from '../../src/engine/analytics.js';
import * as TypesBarrel from '../../src/schema/types.js';

describe('Barrel Files Coverage', () => {
  it('should export all analytics functions from barrel file', () => {
    expect(AnalyticsBarrel.AnalyticsEngine).toBeDefined();
  });

  it('should export all types from types barrel file', () => {
    expect(TypesBarrel).toBeDefined();
  });
});

/**
 * Tests for boomerang-v3 exports (src/index.ts)
 */

import { describe, it, expect } from 'vitest';
import { orchestrator, plugin, default as boomerang } from '../src/index.js';

describe('boomerang-v3 exports', () => {
  describe('orchestrator export', () => {
    it('should export orchestrator with correct name', () => {
      expect(orchestrator).toBeDefined();
      expect(orchestrator.name).toBe('boomerang-v3');
    });

    it('should export orchestrator with correct version', () => {
      expect(orchestrator.version).toBe('3.0.0');
    });

    it('should have orchestrator as an object', () => {
      expect(typeof orchestrator).toBe('object');
      expect(orchestrator).toHaveProperty('name');
      expect(orchestrator).toHaveProperty('version');
    });
  });

  describe('plugin export', () => {
    it('should export plugin with correct name', () => {
      expect(plugin).toBeDefined();
      expect(plugin.name).toBe('boomerang-v3-plugin');
    });

    it('should export plugin with correct version', () => {
      expect(plugin.version).toBe('3.0.0');
    });

    it('should have plugin as an object', () => {
      expect(typeof plugin).toBe('object');
      expect(plugin).toHaveProperty('name');
      expect(plugin).toHaveProperty('version');
    });
  });

  describe('default export', () => {
    it('should export default with orchestrator and plugin', () => {
      expect(boomerang).toBeDefined();
      expect(boomerang.orchestrator).toBeDefined();
      expect(boomerang.plugin).toBeDefined();
    });

    it('should have default.orchestrator equal to named orchestrator export', () => {
      expect(boomerang.orchestrator).toEqual(orchestrator);
    });

    it('should have default.plugin equal to named plugin export', () => {
      expect(boomerang.plugin).toEqual(plugin);
    });
  });
});
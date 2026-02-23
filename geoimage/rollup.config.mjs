import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
// import dts from 'rollup-plugin-dts';
import terser from '@rollup/plugin-terser'
import json from '@rollup/plugin-json';
import filesize from 'rollup-plugin-filesize';
import path from 'path';

const packageJson = {
  main: './dist/cjs/',
  module: './dist/esm/',
};

export default [
  {
    external: [
      'isomorphic-fetch',
      'chroma-js',
      'react',
      'react-dom',
      '@deck.gl/core',
      '@deck.gl/extensions',
      '@deck.gl/geo-layers',
      '@deck.gl/layers',
      '@deck.gl/mesh-layers',
      '@loaders.gl/core',
      '@loaders.gl/schema',
      '@loaders.gl/loader-utils'
    ],
    input: './src/index.ts',
    output: [
      {
        file: path.join(packageJson.main, 'index.js'),
        format: 'cjs',
        sourcemap: true,
        inlineDynamicImports: true,
      },
      {
        file: path.join(packageJson.main, 'index.min.js'),
        format: 'cjs',
        sourcemap: true,
        plugins: [terser()],
        inlineDynamicImports: true,
      },
      {
        file: path.join(packageJson.module, 'index.js'),
        format: 'esm',
        sourcemap: true,
        inlineDynamicImports: true,
      },
      {
        file: path.join(packageJson.module, 'index.min.js'),
        format: 'esm',
        sourcemap: true,
        plugins: [terser()],
        inlineDynamicImports: true,
      },
    ],
    plugins: [
      json(),
      resolve({
        preferBuiltins: true,
        browser: true,
      }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json', exclude: ['**.js'] }),
      filesize(),
    ],
  },
  // {
  //   input: 'dist/esm/types/index.d.ts',
  //   output: [{ file: 'dist/index.d.ts', format: 'esm' }],
  //   plugins: [dts()],
  //   external: ['react', 'react-dom'],
  // },
];

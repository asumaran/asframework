import { defineConfig } from 'vite';
import babel from 'vite-plugin-babel';

export default defineConfig({
  base: '/asframework/',
  plugins: [
    babel({
      babelConfig: {
        plugins: [
          ['babel-plugin-jsx-dom-expressions', {
            moduleName: '/src/framework/dom',
            generate: 'dom',
            delegateEvents: true,
            wrapConditionals: true,
          }]
        ]
      }
    })
  ]
});

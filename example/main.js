import wasm from './h.wasm';

wasm.init().then(mod => {
  console.log('mod', mod);
});


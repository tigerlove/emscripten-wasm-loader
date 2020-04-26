'use strict';

const _bluebird = require('bluebird');
const fs = require('fs');
const path = require('path');

const readFile = _bluebird.promisify(fs.readFile);
function wasmLoader(wasmArray, wasmEnv, wasmFileName) {
	return `
		var instanceCallback;

		${wasmEnv ? wasmEnv.replace("[custom-loader]", `
			Module["wasmBinary"] = [];
			globalEnv = info;
			function instantiateArrayBuffer(receiver) {
				instanceCallback = receiver;
			}
		`) : ``}

		var wasmBinary = new Uint8Array(${JSON.stringify(wasmArray)})

		var hasStreaming = typeof WebAssembly.instantiateStreaming === "function";
	
		globalEnv.env = bindMemory(globalEnv.env);

		(function() {
			if (hasStreaming) {
				return WebAssembly.instantiateStreaming(new Response(wasmBinary, {
					headers: {
						"content-type": "application/wasm"
					}
				}), globalEnv)
			} else {
				return WebAssembly.instantiate(wasmBinary, globalEnv);
			}
		})().then(function(e) {
			if (instanceCallback) {
				instanceCallback(e);
			}
			resolve({
				raw: e,
				emModule: Module,
				exports: e.instance.exports
			});
		}).catch(reject);

	`;
}
function buildModule(wasmEnv, wasmFileName, wasmArray) {
	return `module.exports = {
		init: function() {
			if (typeof Promise === "undefined") {
				throw new Error("No Promise support!");
			}
			if (typeof ArrayBuffer === "undefined") {
				throw new Error("No ArrayBuffer support!");
			}
			
			adjustEnv = function(obj) { return obj};
			function bindMemory(env) { 
				var re = adjustEnv(env) 
				return re
			};
			var Module = {};
			var globalEnv = {};
			return new Promise((resolve, reject) => {
				// WASM support
				if (typeof WebAssembly === "undefined") {
					throw new Error("No Webassembly support!");
				}
				${wasmLoader(wasmArray, wasmEnv, wasmFileName)}
			});
		}
	}`;
}

function createBuildWasmName(resource, content) {
	const fileName = path.basename(resource, path.extname(resource));
	return `${fileName}.wasm`;
}

exports.default = async function loader(content) {
	let cb = this.async();

	const wasmBuildName = createBuildWasmName(this.resourcePath, content);
	const indexFile = wasmBuildName.replace('.wasm', '.js');

	try {
		let wasmHex = [];
		let wasmEnv = ""; // emscripten 生成的js文件
		let wasmContent = ""; // wasm 文件内容
		let wasmFileName = this.resourcePath.split(/\\|\//gmi).pop().split(".").shift() + ".wasm";


    const wasmFile = wasmBuildName;
    wasmContent = await readFile(path.join(this.context, wasmFile));

    wasmHex = wasmContent.toString("hex").match(/.{1,2}/g).map(s => parseInt(s, 16)); // wasm 文件的hex
    wasmEnv = await readFile(path.join(this.context, indexFile));

    if (wasmEnv && wasmEnv.length) {
      wasmEnv = wasmEnv.toString()
      // adjust code that causes minify error
      .replace(".replace(/\\\\/g,\"/\")", ".split('').map(function(s) { return s === '\\\\' ? '/' : s;}).join('');")
      .replace(/var Module.+?;/gm, "")

      // remove node require statements
      if (this.target !== "node") {
        wasmEnv = wasmEnv
        .replace(/require\(.fs.\)/gmi, "undefined")
        .replace(/require\(.path.\)/gmi, "undefined")
      }

      let initArrayBuff = wasmEnv.indexOf("function instantiateArrayBuffer");
      let initArrayBuffEnd = initArrayBuff;
      let level = 0;
      let ptr = initArrayBuff;
      while (ptr !== -1 && ptr < wasmEnv.length) {
        if (wasmEnv[ptr] === "{") {
          level++;
          ptr++;
        } else if(wasmEnv[ptr] === "}") {
          level--;
          if (level === 0) {
            initArrayBuffEnd = ptr + 1;
            ptr = -1;
          } else {
            ptr++;
          }
        } else {
          ptr++;
        }
			}
			wasmEnv = wasmEnv.substring(0, initArrayBuff) + "[custom-loader]" + wasmEnv.substring(initArrayBuffEnd, wasmEnv.length + 1);
    }

		const module = buildModule(wasmEnv, wasmFileName, wasmHex);
		this.emitFile(wasmFileName, wasmContent);
		cb(null, module);

	} catch (e) {

		cb(e);
	}

	return null;
};

// em++ -Os -s WASM=0 -s ONLY_MY_CODE=1  add.c -o output.js

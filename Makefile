all: fields.wasm

fields.wasm: wasm.cpp
	emcc  wasm.cpp --no-entry   -o fields.wasm  -sERROR_ON_UNDEFINED_SYMBOLS=0 -s IMPORTED_MEMORY -s MAXIMUM_MEMORY=512mb -s ALLOW_MEMORY_GROWTH=1 -s SHARED_MEMORY=0 -s WASM=1 -O3

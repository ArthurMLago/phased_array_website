mkdir compiled_wasm
OUT_FILENAME_PREFIX="compiled_wasm/fields"
OUT_FILENAME_SUFFIX=".wasm"

DEFAULT_CFLAGS=""
for simd in 0 1; do
    for bm in 0 1; do
        for sm in 0 1; do

            for th in 0 1; do
                OUT_FILENAME="${OUT_FILENAME_PREFIX}"
                CFLAGS="${DEFAULT_CFLAGS}"

                # Shared memory
                if [ $sm == 1 ]; then
                    OUT_FILENAME="${OUT_FILENAME}_sm"
                    CFLAGS="$CFLAGS -sSHARED_MEMORY=1"
                else
                    CFLAGS="$CFLAGS -sSHARED_MEMORY=0"
                fi

                # SIMD variation:
                if [ $simd == 1 ]; then
                    OUT_FILENAME="${OUT_FILENAME}_simd"
                    CFLAGS="$CFLAGS -msimd128"
                fi

                # Bulk memory operations:
                if [ $bm == 1 ]; then
                    OUT_FILENAME="${OUT_FILENAME}_bm"
                    CFLAGS="$CFLAGS -mbulk-memory"
                fi

                # Threads:
                if [ $th == 1 ]; then
                    if [ $sm == 0 ]; then
                        continue
                    fi
                    OUT_FILENAME="${OUT_FILENAME}_th"
                    CFLAGS="$CFLAGS -pthread -sPTHREAD_POOL_SIZE=navigator.hardwareConcurrency -DPARALLEL_ENABLED=1"
                fi
                OUT_FILENAME="${OUT_FILENAME}${OUT_FILENAME_SUFFIX}"

                emcc  wasm.cpp --no-entry   -o $OUT_FILENAME  -sERROR_ON_UNDEFINED_SYMBOLS=0 -s IMPORTED_MEMORY -s ALLOW_MEMORY_GROWTH=1 -s WASM=1 ${CFLAGS} -g -O2
            done
        done
    done
done




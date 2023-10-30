mkdir -p deploy
OUT_FILENAME_PREFIX="deploy/fields"
OUT_FILENAME_SUFFIX=".js"

DEFAULT_CFLAGS="-sMODULARIZE -s "'EXPORT_NAME="createMyModule"'
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

                emcc  wasm.cpp --no-entry -o $OUT_FILENAME -s ASSERTIONS=1 -s IMPORTED_MEMORY=1 -s ALLOW_MEMORY_GROWTH=1 -s WASM=1 ${CFLAGS} -O3 &
            done
        done
    done
done

cp gear.svg color_scale.png deploy
cp jquery-3.6.2.min.js wasm-feature-detect.js deploy
# -sMODULARIZE -s 'EXPORT_NAME="createMyModule"'
#
npx html-minifier --collapse-whitespace --remove-comments --remove-optional-tags --remove-redundant-attributes --remove-script-type-attributes --remove-tag-whitespace --use-short-doctype --minify-css true --minify-js true < index.html > deploy/index.html
npx uglifyjs --compress --mangle < scripts.js > deploy/scripts.js
npx uglifyjs --compress --mangle < fieldsWorker.js > deploy/fieldsWorker.js
npx uglifycss < style.css > deploy/style.css


wait


#include <math.h>
#include <stdlib.h>
#include <stdint.h>
#ifdef PARALLEL_ENABLED
    #include <thread>
#endif

#ifdef __cplusplus
#define EXTERN extern "C"
#else
#define EXTERN
#endif

#ifndef TEST
    #define CONDITIONAL_EMSCRIPTEN_KEEPALIVE EMSCRIPTEN_KEEPALIVE
    #include <emscripten/emscripten.h>
    #define N_CHANNELS 4
#else
    #define CONDITIONAL_EMSCRIPTEN_KEEPALIVE
    #define N_CHANNELS 4
#endif

#ifndef PARALLEL_ENABLED
    #define PARALLEL_ENABLED 0
#endif


EXTERN void consolelogf(float v);
EXTERN void consoleloga(unsigned long v);

/** 
 * struct representing an antenna position
 */
struct pos{
    double x;
    double y;
    double z;
};

/**
 *  struct for representing a complex number with double precision
 */
struct cf64{
    double re;
    double im;
};

/**
 * struct storing a bunch of variables used in calculations globally:
 */
struct global_param_struct{
    unsigned nAnt;
    struct pos *antPos;
    struct cf64 *feeds;
    double startX;
    double startY;
    double drawScale;
    unsigned resolution;
    unsigned width;
    unsigned height;
    double carrierFreq;
    double waveSpeed;
    uint8_t changed;
    unsigned nthreads;
} saved_params;

// These variables are shared betwen the magnitude and fields images functions, the first two store magnitudes and phases
// mainly because whe calculating fields, having these 2 values for every pixel makes calculating the field infinitely faster:
float *last_mag = NULL;
float *last_ph = NULL;
float *field = NULL;

void calculate_magnitudes(double startX, double startY, unsigned resolution, unsigned width, unsigned height, float*outMag, float*outPh){
    // sinusoid frequency:
    float sinFreq = 2 * M_PI * saved_params.carrierFreq / saved_params.waveSpeed;
    // Divide the dimensions by the resolutiona nd truncate up to get how many magnitudes/phases we have to calculate:
    unsigned w_c = (width + resolution - 1) / resolution;
    unsigned h_c = (height + resolution - 1) / resolution;
    for (unsigned n = 0; n < h_c; n++){
        // Y position in the simulated world:
        double sy = (n * resolution + resolution/2.0)/saved_params.drawScale + startY;
        for (unsigned m = 0; m < w_c; m++){
            // X position in the simulated world:
            double sx = (m*resolution + resolution/2.0)/saved_params.drawScale + startX;
            // We go through all antennas and sum up their contribution in this specific position:
            struct cf64 sumAntennas;
            sumAntennas.re = 0;
            sumAntennas.im = 0;
            for (int i = 0; i < saved_params.nAnt; i++){
                // Get distance of antenna to calculated point:
                float dx = sx - saved_params.antPos[i].x;
                float dy = sy - saved_params.antPos[i].y;
                float dist = sqrt(dx * dx + dy * dy);

                // Summing the complex multiplication of the antenna feed and e^(1j*phase):
                sumAntennas.re += saved_params.feeds[i].re * cos(sinFreq * dist) - saved_params.feeds[i].im * sin(sinFreq * dist);
                sumAntennas.im += saved_params.feeds[i].re * sin(sinFreq * dist) + saved_params.feeds[i].im * cos(sinFreq * dist);
            }
            // Up until now we have (something like) power, convert to amplitude:
            float magnitude = sqrt(sumAntennas.re * sumAntennas.re + sumAntennas.im * sumAntennas.im)/saved_params.nAnt;
            outMag[n*w_c + m] = magnitude;
            // Get the phase:
            outPh[n*w_c + m] = atan2(sumAntennas.im, sumAntennas.re);
        }
    }
}

// Gets a reduced matrix(due to resolution) and creates the full-sized output image:
void createImage(float *in, unsigned height, uint8_t *img){
    unsigned w_c = (saved_params.width + saved_params.resolution - 1) / saved_params.resolution;
    for (unsigned i = 0; i < height; i++){
        for (unsigned j = 0; j < saved_params.width; j++){
            float normalized_val = (in[i/saved_params.resolution * w_c + j/saved_params.resolution] - 0.5 ) * 2;
            // Yellow for positives, blue for negatives:
            if (normalized_val >= 0){
                img[(i * saved_params.width + j) * N_CHANNELS + 0] = normalized_val * 255;
                img[(i * saved_params.width + j) * N_CHANNELS + 1] = normalized_val * 255;
                img[(i * saved_params.width + j) * N_CHANNELS + 2] = 0;
            }else{
                img[(i * saved_params.width + j) * N_CHANNELS + 0] = 0;
                img[(i * saved_params.width + j) * N_CHANNELS + 1] = 0;
                img[(i * saved_params.width + j) * N_CHANNELS + 2] = -normalized_val * 255;
            }
            // Full transparency at all times:
            img[(i * saved_params.width + j) * N_CHANNELS + 3] = 255;
        }
    }
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void updateParams(unsigned nthreads,
                                                          unsigned nAnt,
                                                          struct pos *antPos,
                                                          struct cf64 *feeds,
                                                          float startX,
                                                          float startY,
                                                          float drawScale,
                                                          unsigned resolution,
                                                          unsigned width,
                                                          unsigned height,
                                                          float carrierFreq,
                                                          float waveSpeed){
    saved_params.nthreads = nthreads;
    saved_params.nAnt = nAnt;
    saved_params.antPos = antPos;
    saved_params.feeds = feeds;
    saved_params.startX = startX;
    saved_params.startY = startY;
    saved_params.drawScale = drawScale;
    saved_params.resolution = resolution;
    saved_params.width = width;
    saved_params.height = height;
    saved_params.carrierFreq = carrierFreq;
    saved_params.waveSpeed = waveSpeed;
    saved_params.changed = 1;
}

bool checkChanged(){
    unsigned w_c = (saved_params.width + saved_params.resolution - 1) / saved_params.resolution;
    unsigned h_c = (saved_params.height + saved_params.resolution - 1) / saved_params.resolution;
    if (saved_params.changed || !last_mag || !last_ph || !field){
        if (last_mag){
            free(last_mag);
        }
        if (last_ph){
            free(last_ph);
        }
        if (field){
            free(field);
        }

        last_mag = (float*)malloc(w_c * h_c * sizeof(float));
        last_ph = (float*)malloc(w_c * h_c * sizeof(float));
        field = (float*)malloc(w_c * h_c * sizeof(float));

        // Evertime this is called, magnitudes are calculated immediatly after if necessary, so consider it updated already:
        saved_params.changed = false;

        return true;
    }
    return false;
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void getMagnitudeImage(uint8_t*out){
    bool magPending = checkChanged();
    unsigned w_c = (saved_params.width + saved_params.resolution - 1) / saved_params.resolution;
    unsigned h_c = (saved_params.height + saved_params.resolution - 1) / saved_params.resolution;
    #if !PARALLEL_ENABLED
        if (magPending){
            calculate_magnitudes(saved_params.startX,
                                saved_params.startY,
                                saved_params.resolution,
                                saved_params.width,
                                saved_params.height,
                                last_mag,
                                last_ph);
        }
        for (unsigned n = 0; n < h_c; n++){
            for (unsigned m = 0; m < w_c; m++){
                // Convert to dB:
                field[n*w_c + m] = log10(last_mag[n*w_c + m] + 0.0000001)/3 + 1;
                // Clip:
                if (field[n*w_c + m] < 0){
                    field[n*w_c + m] = 0;
                }
            }
        }
        createImage(field, saved_params.height, out);
    #else
        unsigned rows_per_thread = (h_c - 1 + saved_params.nthreads)/saved_params.nthreads;
        std::thread *tlist[saved_params.nthreads];
        for (int i = 0; i < saved_params.nthreads; i++){
            tlist[i] = new std::thread([magPending,i,w_c,h_c,rows_per_thread,out] () {
                if (saved_params.height < i * rows_per_thread * saved_params.resolution){
                    return;
                }
                if (magPending){
                    calculate_magnitudes(saved_params.startX,
                                        saved_params.startY + i* rows_per_thread * saved_params.resolution / saved_params.drawScale,
                                        saved_params.resolution,
                                        saved_params.width,
                                        std::min(rows_per_thread * saved_params.resolution, saved_params.height - i * rows_per_thread * saved_params.resolution),
                                        last_mag + i * w_c * rows_per_thread,
                                        last_ph + i * w_c * rows_per_thread);
                }
                for (unsigned n = i * rows_per_thread; n < std::min((i + 1) * rows_per_thread, h_c); n++){
                    for (unsigned m = 0; m < w_c; m++){
                        // Log10:
                        field[n*w_c + m] = log10(last_mag[n*w_c + m] + 0.0000001)/3 + 1;
                        // Clip:
                        if (field[n*w_c + m] < 0){
                            field[n*w_c + m] = 0;
                        }

                    }
                }
                createImage(field + i * w_c * rows_per_thread,
                            std::min(rows_per_thread * saved_params.resolution, saved_params.height - i * rows_per_thread * saved_params.resolution),
                            out + N_CHANNELS * saved_params.width * i * rows_per_thread * saved_params.resolution);
            });
        }
        for (int i = 0; i < saved_params.nthreads; i++){
            tlist[i]->join();
            delete tlist[i];
        }
    #endif
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void getFieldImage(double t, uint8_t*out){

    bool magPending = checkChanged();
    unsigned w_c = (saved_params.width + saved_params.resolution - 1) / saved_params.resolution;
    unsigned h_c = (saved_params.height + saved_params.resolution - 1) / saved_params.resolution;
    float timePhase = -2*M_PI*saved_params.carrierFreq * t;
    #if !PARALLEL_ENABLED
        if (magPending){
            calculate_magnitudes(saved_params.startX, saved_params.startY, saved_params.resolution, saved_params.width, saved_params.height, last_mag, last_ph);
        }
        // Calculate field from magnitude, initial phase and time, since this is much faster than calculating every individual antenna:
        for (unsigned n = 0; n < h_c; n++){
            for (unsigned m = 0; m < w_c; m++){
                field[n*w_c + m] = last_mag[n*w_c + m] * cos(timePhase + last_ph[n*w_c + m])/2 + .5;
            }
        }
        createImage(field, saved_params.height, out);
    #else
        // Number of rows each thread will calculate(at most, we may have underworked threads):
        unsigned rows_per_thread = (h_c - 1 + saved_params.nthreads)/saved_params.nthreads;
        // Spawn a bunch of threads, use C++ lambda functions
        std::thread *tlist[saved_params.nthreads];
        for (int i = 0; i < saved_params.nthreads; i++){
            tlist[i] = new std::thread([magPending,i,w_c,h_c,timePhase,rows_per_thread,out] () {
                // It is possible we have more threads than necessary rows to calculate, check it and return immediatly
                // if that's the case:
                if (saved_params.height < i * rows_per_thread * saved_params.resolution){
                    return;
                }
                // Do exactly the same thing as the serial version of the code, but each function call or operation
                // will operate on only a range of rows:
                if (magPending){
                    calculate_magnitudes(saved_params.startX,
                                        saved_params.startY + i* rows_per_thread * saved_params.resolution / saved_params.drawScale,
                                        saved_params.resolution,
                                        saved_params.width,
                                        std::min(rows_per_thread * saved_params.resolution, saved_params.height - i * rows_per_thread * saved_params.resolution),
                                        last_mag + i * w_c * rows_per_thread,
                                        last_ph + i * w_c * rows_per_thread);
                }
                for (unsigned n = i * rows_per_thread; n < std::min((i + 1) * rows_per_thread, h_c); n++){
                    for (unsigned m = 0; m < w_c; m++){
                        field[n*w_c + m] = last_mag[n*w_c + m] * cos(timePhase + last_ph[n*w_c + m])/2 + .5;
                    }
                }
                createImage(field + i * w_c * rows_per_thread,
                            std::min(rows_per_thread * saved_params.resolution, saved_params.height - i * rows_per_thread * saved_params.resolution),
                            out + N_CHANNELS * saved_params.width * i * rows_per_thread * saved_params.resolution);
            });
        }
        // Join the bunch of threads:
        for (int i = 0; i < saved_params.nthreads; i++){
            tlist[i]->join();
            delete tlist[i];
        }
    #endif
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void* getMousePositionInfo(double t, float startX, float startY){
    static struct ret_info{
        float magnitude;
        float initial_phase;
        float phase;
        float magdb;
        float re;
        float im;
    } ret;
    calculate_magnitudes(startX, saved_params.startY, 1, 1, 1, &ret.magnitude, &ret.initial_phase);
    ret.phase = ret.initial_phase + 2 * M_PI * saved_params.carrierFreq * t;
    ret.magdb = log10(ret.magnitude + 0.0000001)/3 + 1;
    ret.re = ret.magnitude * sin(ret.phase);
    ret.im = ret.magnitude * cos(ret.phase);

    return &ret;
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE unsigned long exportedMalloc(unsigned long nbytes){
    return (unsigned long)malloc(nbytes);
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void exportedFree(unsigned long address){
    free((void*)address);
}

#ifdef TEST
#include <chrono>
#include <string.h>
#include <stdio.h>
using clockk = std::chrono::system_clock;
using sec = std::chrono::duration<double>;

int main(int argc, char **argv){
    FILE *timingFile = NULL;
    if (argc > 1){
        timingFile = fopen(argv[1], "w");
    }
    uint8_t *out = NULL;

    char op[256] = "dummy";
    int ret = 9999;
    while(strcmp(op, "end") && ret > 0){
        ret = scanf("%s", op);
        if (!strcmp(op, "update")){
            // Store everything in the same struct, but still use updateParams, for test coverage, etc:
            struct global_param_struct temp;

            scanf("%u", &temp.nthreads);
            scanf("%u", &temp.nAnt);
            scanf("%lf", &temp.startX);
            scanf("%lf", &temp.startY);
            scanf("%lf", &temp.drawScale);
            scanf("%u", &temp.resolution);
            scanf("%u", &temp.width);
            scanf("%u", &temp.height);
            scanf("%lf", &temp.carrierFreq);
            scanf("%lf", &temp.waveSpeed);

            if (out){
                free(temp.antPos);
                free(temp.feeds);
                free(out);
            }
            temp.antPos = (struct pos*)malloc(sizeof(struct pos) * temp.nAnt);
            temp.feeds = (struct cf64*)malloc(sizeof(struct cf64) * temp.nAnt);
            out = (uint8_t*)malloc(temp.width * temp.height * N_CHANNELS);

            for (int i = 0; i < temp.nAnt; i++){
                scanf("%lf", &(temp.antPos[i].x));
                scanf("%lf", &(temp.antPos[i].y));
                scanf("%lf", &(temp.antPos[i].z));

            }
            for (int i = 0; i < temp.nAnt; i++){
                scanf("%lf", &(temp.feeds[i].re));
                scanf("%lf", &(temp.feeds[i].im));
            }

            updateParams(temp.nthreads, temp.nAnt,temp.antPos, temp.feeds, temp.startX, temp.startY, temp.drawScale,
                    temp.resolution, temp.width, temp.height, temp.carrierFreq, temp.waveSpeed);

        }else if (!strcmp(op, "mag")){
            const auto before = clockk::now();
            getMagnitudeImage(out);
            const sec duration = clockk::now() - before;
            if (timingFile){
                fprintf(timingFile, "%lf\n", duration);
            }
            printf("P3\n%d %d\n255\n", saved_params.width, saved_params.height);
            for (int i = 0; i < saved_params.width * saved_params.height; i++){
                printf("%d %d %d ", out[i*N_CHANNELS], out[i*N_CHANNELS + 1], out[i*N_CHANNELS + 2]);
            }
        }else if(!strcmp(op, "field")){
            double time;
            scanf("%lf", &time);
            const auto before = clockk::now();
            getFieldImage(time, out);
            const sec duration = clockk::now() - before;
            if (timingFile){
                fprintf(timingFile, "%lf\n", duration);
            }
            printf("P3\n%d %d\n255\n", saved_params.width, saved_params.height);
            for (int i = 0; i < saved_params.width * saved_params.height; i++){
                printf("%d %d %d ", out[i*N_CHANNELS], out[i*N_CHANNELS + 1], out[i*N_CHANNELS + 2]);
            }

        }
    }

}
#endif

#include <math.h>
#include <stdlib.h>
#include <stdint.h>
#if PARALLEL_ENABLED
    #include <thread>
    #include <barrier>
#endif


#include <fcntl.h>
#include <unistd.h>



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
#else
#endif

#if PARALLEL_ENABLED
    #define TEST_FILE_PREFIX "p"
#else
    #define TEST_FILE_PREFIX "s"
#endif

#define FAR_FIELD 1e3
#define ANTENNA_DIAGRAM_DIVS 1800

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
 *  struct for representing a complex number with float precision
 */
struct cf64{
    float re;
    float im;
};

/**
 * struct storing a bunch of variables used in calculations globally:
 */
struct global_param_struct{
    unsigned nAnt;
    struct pos *antPos;
    struct cf64 *feeds;
    double antennaCenterX;
    double antennaCenterY;
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
float antennaDiagram[ANTENNA_DIAGRAM_DIVS];
float magnitudeSumFarRange = -1;

template <typename calcT, typename retT>
inline retT sumAntennasAt(calcT x, calcT y){
    // sinusoid frequency(this is a loop invariant, we hope it is optimed out of the loops since this is an inline function):
    double sinFreq = 2 * M_PI * saved_params.carrierFreq / saved_params.waveSpeed;
    // We go through all antennas and sum up their contribution in this specific position:
    retT sumAntennas;
    sumAntennas.re = 0;
    sumAntennas.im = 0;
    for (int i = 0; i < saved_params.nAnt; i++){
        // Get distance of antenna to calculated point:
        calcT dx = x - saved_params.antPos[i].x;
        calcT dy = y - saved_params.antPos[i].y;
        calcT dist = sqrt(dx * dx + dy * dy);

        // Summing the complex multiplication of the antenna feed and e^(1j*phase):
        sumAntennas.re += saved_params.feeds[i].re * cosf(sinFreq * dist) - saved_params.feeds[i].im * sinf(sinFreq * dist);
        sumAntennas.im += saved_params.feeds[i].re * sinf(sinFreq * dist) + saved_params.feeds[i].im * cosf(sinFreq * dist);
    }
    return sumAntennas;
}

void calculateAntennaDiagram(){
    magnitudeSumFarRange = 0;
    #if !PARALLEL_ENABLED
        for (int i = 0; i < ANTENNA_DIAGRAM_DIVS; i++){
            double angle = 2 * M_PI / ANTENNA_DIAGRAM_DIVS * i;
            struct cf64 sum = sumAntennasAt<double, struct cf64>(FAR_FIELD * cos(angle) + saved_params.antennaCenterX, FAR_FIELD * sin(angle) + saved_params.antennaCenterY);
            antennaDiagram[i] = sqrtf(sum.re * sum.re + sum.im * sum.im);
            magnitudeSumFarRange += antennaDiagram[i];
        }
        magnitudeSumFarRange /= ANTENNA_DIAGRAM_DIVS;
        // The /2 is merely for convenience, to make the peak be exactly 0dB, instead of only half power, since
        // we are assuming an antenna that propagates both at the front and back:
        magnitudeSumFarRange *= saved_params.nAnt / 2;
        for (int i = 0; i < ANTENNA_DIAGRAM_DIVS; i++){
            antennaDiagram[i] /= magnitudeSumFarRange;
            antennaDiagram[i] = 20 * log10(antennaDiagram[i] + 0.001);
        }
    #else
        // Number of elements each thread will calculate(at most, we may have underworked threads):
        unsigned elements_per_thread = (ANTENNA_DIAGRAM_DIVS - 1 + saved_params.nthreads)/saved_params.nthreads;
        // Spawn a bunch of threads, use C++ lambda functions
        std::thread *tlist[saved_params.nthreads];
        double magnitudeSumFarRangePerThread[saved_params.nthreads];
        std::barrier sync_point(saved_params.nthreads);
        for (int i = 0; i < saved_params.nthreads; i++){
            tlist[i] = new std::thread([&magnitudeSumFarRangePerThread, i, elements_per_thread, &sync_point] () {
                magnitudeSumFarRangePerThread[i] = 0;
                for (int j = i * elements_per_thread; j < std::min((unsigned)(i + 1) * elements_per_thread, (unsigned)ANTENNA_DIAGRAM_DIVS); j++){
                    double angle = 2 * M_PI / ANTENNA_DIAGRAM_DIVS * j;
                    struct cf64 sum = sumAntennasAt<double, struct cf64>(FAR_FIELD * cos(angle), FAR_FIELD * sin(angle));
                    antennaDiagram[j] = sqrtf(sum.re * sum.re + sum.im * sum.im);
                    magnitudeSumFarRangePerThread[i] += antennaDiagram[j];
                }
                sync_point.arrive_and_wait();
                if (i == 0){
                    magnitudeSumFarRange = 0;
                    for (int j = 0; j < saved_params.nthreads; j++){
                        magnitudeSumFarRange += magnitudeSumFarRangePerThread[j];
                    }
                    magnitudeSumFarRange /= ANTENNA_DIAGRAM_DIVS;
                    magnitudeSumFarRange *= saved_params.nAnt / 2.0;
                }
                sync_point.arrive_and_wait();
                for (int j = i * elements_per_thread; j < std::min((unsigned)(i + 1) * elements_per_thread, (unsigned)ANTENNA_DIAGRAM_DIVS); j++){
                    antennaDiagram[j] /= magnitudeSumFarRange;
                }
            });
        }
        for (int i = 0; i < saved_params.nthreads; i++){
            magnitudeSumFarRange += magnitudeSumFarRangePerThread[i];
            tlist[i]->join();
            delete tlist[i];
        }
    #endif
}

void calculate_magnitudes(double startX, double startY, unsigned resolution, unsigned width, unsigned height, float*outMag, float*outPh){
    // Divide the dimensions by the resolutiona nd truncate up to get how many magnitudes/phases we have to calculate:
    unsigned w_c = (width + resolution - 1) / resolution;
    unsigned h_c = (height + resolution - 1) / resolution;
    for (unsigned n = 0; n < h_c; n++){
        // Y position in the simulated world:
        double sy = -(n * resolution + resolution/2.0)/saved_params.drawScale + startY;
        for (unsigned m = 0; m < w_c; m++){
            // X position in the simulated world:
            double sx = (m*resolution + resolution/2.0)/saved_params.drawScale + startX;
            // Sum antennas contributions at this position:
            struct cf64 sumAntennas = sumAntennasAt<double, struct cf64>(sx, sy);
            // Get magnitude:
            float magnitude = sqrtf(sumAntennas.re * sumAntennas.re + sumAntennas.im * sumAntennas.im)/saved_params.nAnt;
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
                                                          double startX,
                                                          double startY,
                                                          double antennaCenterX,
                                                          double antennaCenterY,
                                                          double drawScale,
                                                          unsigned resolution,
                                                          unsigned width,
                                                          unsigned height,
                                                          double carrierFreq,
                                                          double waveSpeed){
    saved_params.nthreads = nthreads;
    saved_params.nAnt = nAnt;
    saved_params.antPos = antPos;
    saved_params.feeds = feeds;
    saved_params.startX = startX;
    saved_params.startY = startY;
    saved_params.antennaCenterX = antennaCenterX;
    saved_params.antennaCenterY = antennaCenterY;
    saved_params.drawScale = drawScale;
    saved_params.resolution = resolution;
    saved_params.width = width;
    saved_params.height = height;
    saved_params.carrierFreq = carrierFreq;
    saved_params.waveSpeed = waveSpeed;

    // checks if necessary:
    saved_params.changed = 1;
    calculateAntennaDiagram();
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
                // Convert to dB and then scales from 0(when -60dB or lower) to 1(when 0dB):
                field[n*w_c + m] = log10(last_mag[n*w_c + m] + 0.001)*20/60 + 1;
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
                                        saved_params.startY - i* rows_per_thread * saved_params.resolution / saved_params.drawScale,
                                        saved_params.resolution,
                                        saved_params.width,
                                        std::min(rows_per_thread * saved_params.resolution, saved_params.height - i * rows_per_thread * saved_params.resolution),
                                        last_mag + i * w_c * rows_per_thread,
                                        last_ph + i * w_c * rows_per_thread);
                }
                for (unsigned n = i * rows_per_thread; n < std::min((i + 1) * rows_per_thread, h_c); n++){
                    for (unsigned m = 0; m < w_c; m++){
                        // Log10:
                        field[n*w_c + m] = log10(last_mag[n*w_c + m] + 0.001)/3 + 1;
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
    double timePhase = -2*M_PI*saved_params.carrierFreq * t;
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
                                        saved_params.startY - i* rows_per_thread * saved_params.resolution / saved_params.drawScale,
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



EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE float* getAntennaDiagram(){
    return antennaDiagram;
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void* getMousePositionInfo(double t, double mx, double my){
    static struct ret_info{
        double magnitude;
        double initial_phase;
        double phase;
        double magdb;
        double re;
        double im;
        double far_field_mag;
        double far_field_magdb;
        double azimuth;
        double distance;
    } ret;
    struct cf64 sumAntennas = sumAntennasAt<double, struct cf64>(mx, my);
    ret.magnitude = sqrt(sumAntennas.re * sumAntennas.re + sumAntennas.im * sumAntennas.im)/saved_params.nAnt;
    ret.initial_phase = atan2(sumAntennas.im, sumAntennas.re);
    ret.magdb = 20 * log10(ret.magnitude + 0.001);
    ret.phase = ret.initial_phase - 2 * M_PI * saved_params.carrierFreq * t;
    ret.re = ret.magnitude * cos(ret.phase);
    ret.im = ret.magnitude * sin(ret.phase);

    // Polar stuff:
    double x = mx - saved_params.antennaCenterX;
    double y = my - saved_params.antennaCenterY;
    ret.azimuth = atan2(y,x);
    ret.distance = sqrt(x*x + y*y);
    sumAntennas = sumAntennasAt<double, struct cf64>(FAR_FIELD * cos(ret.azimuth) +saved_params.antennaCenterX, FAR_FIELD * sin(ret.azimuth) + saved_params.antennaCenterY);
    ret.far_field_mag = sqrt(sumAntennas.re * sumAntennas.re + sumAntennas.im * sumAntennas.im)/saved_params.nAnt;
    ret.far_field_magdb = 20 * log10(ret.far_field_mag + 0.001);

    // After all important calculations are done using radiants, convert to degrees for easier visualization
    ret.phase *= 180 / M_PI;
    ret.initial_phase *= 180 / M_PI;
    ret.azimuth *= 180 / M_PI;

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
    int n_commands_read = 0;
    while(strcmp(op, "end") && ret > 0){
        ret = scanf("%s", op);
        if (ret <= 0){
            break;
        }else if (!strcmp(op, "update")){
            // Store everything in the same struct, but still use updateParams, for test coverage, etc:
            struct global_param_struct temp; // TODO MAKE IT STATIC!!!!

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
                scanf("%f", &(temp.feeds[i].re));
                scanf("%f", &(temp.feeds[i].im));
            }

            updateParams(temp.nthreads, temp.nAnt,temp.antPos, temp.feeds, temp.startX, temp.startY,0,0, temp.drawScale,
                    temp.resolution, temp.width, temp.height, temp.carrierFreq, temp.waveSpeed);

        }else if (!strcmp(op, "mag")){
            const auto before = clockk::now();
            getMagnitudeImage(out);
            const sec duration = clockk::now() - before;
            if (timingFile){
                #if PARALLEL_ENABLED
                    fprintf(timingFile, "%d, ", saved_params.nthreads);
                #endif
                fprintf(timingFile, "%lf\n", duration);
            }
            printf("P3\n%d %d\n255\n", saved_params.width, saved_params.height);
            for (int i = 0; i < saved_params.width * saved_params.height; i++){
                printf("%d %d %d\n", out[i*N_CHANNELS], out[i*N_CHANNELS + 1], out[i*N_CHANNELS + 2]);
            }
        }else if(!strcmp(op, "field")){
            double time;
            scanf("%lf", &time);
            const auto before = clockk::now();
            getFieldImage(time, out);
            const sec duration = clockk::now() - before;
            if (timingFile){
                #if PARALLEL_ENABLED
                    fprintf(timingFile, "%d, ", saved_params.nthreads);
                #endif
                fprintf(timingFile, "%lf\n", duration);
            }
            printf("P3\n%d %d\n255\n", saved_params.width, saved_params.height);
            for (int i = 0; i < saved_params.width * saved_params.height; i++){
                printf("%d %d %d\n", out[i*N_CHANNELS], out[i*N_CHANNELS + 1], out[i*N_CHANNELS + 2]);
            }

        }
        n_commands_read++;
    }
    unsigned w_c = (saved_params.width + saved_params.resolution - 1) / saved_params.resolution;
    unsigned h_c = (saved_params.height + saved_params.resolution - 1) / saved_params.resolution;
}
#endif

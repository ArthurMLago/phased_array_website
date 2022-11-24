#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <vector>

#ifdef __cplusplus
#define EXTERN extern "C"
#else
#define EXTERN
#endif

#ifndef TEST
#define CONDITIONAL_EMSCRIPTEN_KEEPALIVE EMSCRIPTEN_KEEPALIVE
#include <emscripten/emscripten.h>
#else
#define CONDITIONAL_EMSCRIPTEN_KEEPALIVE
#endif

EXTERN void consolelogf(float v);
EXTERN void consoleloga(unsigned long v);

struct pos{
    float x;
    float y;
    float z;
};

struct cf32{
    float re;
    float im;
};

float pi = 3.14159;

float *last_mag;



void calculate_magnitudes(unsigned nAnt, struct pos *antPos, struct cf32 *feeds, float startX, float startY, float drawScale, unsigned resolution, unsigned width, unsigned height, float carrierFreq, float waveSpeed, float*outMag, float*outPh){
    //consolelogf(111111);
    //consoleloga((unsigned long)out);
    //consoleloga(nAnt);
    //consoleloga(width);
    //consoleloga(height);
    //consolelogf(111111.5);
    float sinFreq = 2 * pi * carrierFreq / waveSpeed;
    unsigned w_c = (width + resolution - 1) / resolution;
    unsigned h_c = (height + resolution - 1) / resolution;
    for (unsigned m = 0; m < w_c; m++){
        float sx = (m*resolution + resolution/2.0)/drawScale + startX;
        for (unsigned n = 0; n < h_c; n++){

            float sy = (n * resolution + resolution/2.0)/drawScale + startY;
            struct cf32 sumAntennas;
            sumAntennas.re = 0;
            sumAntennas.im = 0;
            for (int i = 0; i < nAnt; i++){
                float dx = sx - antPos[i].x;
                float dy = sy - antPos[i].y;
                float dist = sqrt(dx * dx + dy * dy);

                //consolelogf(dist);
                //consolelogf(feeds[i].re);
                //consolelogf(feeds[i].im);
                //consolelogf(sinFreq);
                //consolelogf(feeds[i].re * cos(sinFreq * dist) - feeds[i].im * sin(sinFreq * dist));
                sumAntennas.re += feeds[i].re * cos(sinFreq * dist) - feeds[i].im * sin(sinFreq * dist);
                sumAntennas.im += feeds[i].re * sin(sinFreq * dist) + feeds[i].im * cos(sinFreq * dist);
            }
            float magnitude = sqrt(sumAntennas.re * sumAntennas.re + sumAntennas.im * sumAntennas.im)/nAnt;
            //float magnitude = 20 * log10(sqrt(sumAntennas.re * sumAntennas.re + sumAntennas.im * sumAntennas.im)/nAnt);
            outMag[n*w_c + m] = magnitude;
            if (outPh){
                outPh[n*w_c + m] = atan2(sumAntennas.im, sumAntennas.re);
            }
            //consolelogf(magnitude);
            //consolelogf(nAnt);
            //consolelogf(waveSpeed);
            //consolelogf(carrierFreq);
            //consoleloga((unsigned long)&(out[startj*w_c + starti]));
            //for (int i = starti; i < starti + resolution; i++){
                //for (int j = startj; j < startj + resolution; j++){
                    //out[j*w_c + i] = magnitude;
                    ////consoleloga((unsigned long)&(out[j*w_c + i]));
                //}
            //}

        }
    }
    //consolelogf(222222);
}

void createImage(float *in, unsigned width, unsigned height, unsigned resolution, uint8_t *img){
    unsigned w_c = (width + resolution - 1) / resolution;
    for (unsigned i = 0; i < height; i++){
        for (unsigned j = 0; j < width; j++){
            //consoleloga((unsigned long)&(img[(i * width + j) * 3 + 0]));
            //consoleloga((unsigned long)&(in[i/resolution * w_c + j/resolution]));
            float normalized_val = (in[i/resolution * w_c + j/resolution] - 0.5 ) * 2;
            if (normalized_val >= 0){
                img[(i * width + j) * 4 + 0] = normalized_val * 255;
                img[(i * width + j) * 4 + 1] = normalized_val * 255;
                img[(i * width + j) * 4 + 2] = 0;
            }else{
                img[(i * width + j) * 4 + 0] = 0;
                img[(i * width + j) * 4 + 1] = 0;
                img[(i * width + j) * 4 + 2] = -normalized_val * 255;
            }
            img[(i * width + j) * 4 + 3] = 255;
        }
    }
}




EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void getMagnitudeImage(unsigned nAnt, struct pos *antPos, struct cf32 *feeds, float startX, float startY, float drawScale, unsigned resolution, unsigned width, unsigned height, float carrierFreq, float waveSpeed, uint8_t*out){
    //consolelogf(55555);
    //consolelogf(nAnt);
    //consolelogf(6666);
    for (int i = 0; i < nAnt; i++){
        //consolelogf(antPos[i].x);
        //consolelogf(antPos[i].y);
        //consolelogf(antPos[i].z);

        //consolelogf(feeds[i].re);
        //consolelogf(feeds[i].im);
        //consolelogf(0);
    }
    //printf("nAnt: %d\n", nAnt);
    
    //consolelogf(123451);
    //consolelogf(startX);
    //consolelogf(startY);
    //consolelogf(drawScale);
    //consolelogf(54321);
    unsigned w_c = (width + resolution - 1) / resolution;
    unsigned h_c = (height + resolution - 1) / resolution;
    float *mag = (float*)malloc(w_c * h_c * sizeof(float));
    //consoleloga((unsigned long)out);
    //consoleloga((unsigned long)mag);
    //consoleloga((unsigned long)&nAnt);
    //consoleloga((unsigned long)&width);
    //consolelogf(carrierFreq);
    //consolelogf(waveSpeed);
    //consolelogf(777);
    calculate_magnitudes(nAnt, antPos, feeds, startX, startY, drawScale, resolution, width, height, carrierFreq, waveSpeed, mag, NULL);
    for (unsigned m = 0; m < w_c; m++){
        for (unsigned n = 0; n < h_c; n++){
            // Log10:
            mag[n*w_c + m] = log10(mag[n*w_c + m] + 0.0000001)/3 + 1;
            // Clip:
            if (mag[n*w_c + m] < 0){
                mag[n*w_c + m] = 0;
            }
        }
    }
    //consoleloga((unsigned long)out);
    //consoleloga((unsigned long)mag);
    //consolelogf(carrierFreq);
    //consolelogf(waveSpeed);
    //consolelogf(888);
    createImage(mag, width, height, resolution, out);
    free(mag);
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void getFieldImage(double t, unsigned nAnt, struct pos *antPos, struct cf32 *feeds, float startX, float startY, float drawScale, unsigned resolution, unsigned width, unsigned height, float carrierFreq, float waveSpeed, uint8_t*out, int changed){
    static float *last_mag = NULL;
    static float *last_ph = NULL;
    static float *field = NULL;

    unsigned w_c = (width + resolution - 1) / resolution;
    unsigned h_c = (height + resolution - 1) / resolution;
    if (changed || !last_mag || !last_ph || !field){
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

        calculate_magnitudes(nAnt, antPos, feeds, startX, startY, drawScale, resolution, width, height, carrierFreq, waveSpeed, last_mag, last_ph);
    }
    float timePhase = -2*pi*carrierFreq * t;
    for (unsigned m = 0; m < w_c; m++){
        for (unsigned n = 0; n < h_c; n++){
            field[n*w_c + m] = last_mag[n*w_c + m] * cos(timePhase + last_ph[n*w_c + m])/2 + .5;
        }
    }
    createImage(field, width, height, resolution, out);
    free(field);


}
EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE unsigned long exportedMalloc(unsigned long nbytes){
    return (unsigned long)malloc(nbytes);
}

EXTERN CONDITIONAL_EMSCRIPTEN_KEEPALIVE void exportedFree(unsigned long address){
    free((void*)address);
}

/*EXTERN EMSCRIPTEN_KEEPALIVE void toImage(float* in, unsigned n, float min, float max, uint8_t* out){*/
    /*for (int i = 0; i < n; i++){*/
        /*float v = in[i];*/
        /*if (v > max){*/
            /*v = max;*/
        /*}else if(v < min){*/
            /*v = min;*/
        /*}*/
        /*out[i] = round((v - min) / (max-min) * 255);*/
    /*}*/
/*}*/

#ifdef TEST
#define TEST_N_ANT 2

int main(){
    struct pos ants[TEST_N_ANT];
    struct cf32 feeds[TEST_N_ANT];

    for (int i = 0; i < TEST_N_ANT; i++){
        ants[i].x = i * 0.05;
        ants[i].y = 0;
        ants[i].z = 0;

        feeds[i].re = cos(0.0 * i);
        feeds[i].im = sin(0.0 * i);
    }
    uint8_t out[400*400*4];
    getMagnitudeImage(TEST_N_ANT, ants, feeds, -0.5, -0.5, 700, 4, 400, 400, 3e9, 3e8, out);
    getMagnitudeImage(TEST_N_ANT, ants, feeds, -0.5, -0.5, 700, 4, 400, 400, 3e9, 3e8, out);
    //for (int i = 0; i < 10*10; i++){
        //printf("%d\n", out[i*4]);
    //}
}
#endif

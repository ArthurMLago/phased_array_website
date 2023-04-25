import subprocess
import random
import tempfile
import time
import os
import pdb
import sys
import numpy
from PIL import Image

def compile_wasm(parallel, outfile):
    p = subprocess.Popen(["g++", "--std=c++20", "wasm.cpp", "-DPARALLEL_ENABLED=" + str(parallel), "-DTEST=1", "-o", outfile, "-g"])
    p.wait()
    if (p.returncode != 0):
        print("Error compiling")

def get_random_config(seed, nthreads=None):
    random.seed(seed)
    outputString = ""
    random_nthreads = random.randint(2, 64)
    if nthreads == None:
        nthreads = random_nthreads # random number generation cannot be inside conditional to keep consistent outputs
    outputString += "{:d}\n".format(nthreads)
    nAnt = random.randint(1,64)
    outputString += "{:d}\n".format(nAnt)
    outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # startX
    outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # stattY
    outputString += "{:f}\n".format(random.uniform(1e-8,1e3)) # drawScale
    outputString += "{:d}\n".format(random.randint(1, 32)) # resolution
    outputString += "{:d}\n".format(random.randint(1, 3000)) # width
    outputString += "{:d}\n".format(random.randint(1, 3000)) # height
    outputString += "{:f}\n".format(random.uniform(1e-6,1e20)) # carrierFreq
    outputString += "{:f}\n".format(random.uniform(1e-6,1e20)) # waveSpeed
    for i in range(nAnt):
        outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # x
        outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # y
        outputString += "{:f}\n".format(0) # z
    for i in range(nAnt):
        outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # real
        outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # imag
    return outputString

def get_random_input(seed, nthreads=None):
    outputString = "update\n" + get_random_config(seed, nthreads)
    for i in range(random.randint(1,50)):
        op = random.choice(["update", "mag"])
        outputString += op + "\n"
        if (op == "update"):
            outputString += get_random_config(random.randint(0,1532342342), nthreads)
        elif (op == "field"):
            outputString += str(random.uniform(0, 1e5)) + "\n"

    outputString += "end\n"
    return outputString

def parse_images(ls):
    images = []
    progress = 0
    while progress < len(ls) - 1:
        i_width, i_height = (*[int(x) for x in ls[progress + 1].split(" ")],)
        colors_per_line = len(ls[progress + 3].split(" "))
        istart = progress + 3
        iend = int(progress + 3 + i_width * i_height * 3 / colors_per_line)

        # Combine the image data into a single list
        image_data = numpy.concatenate([
            numpy.array([[float(x) for x in ln.split(" ")] for ln in ls[istart:iend]], dtype=numpy.int16)
        ])

        # Reshape the image data into a 3-dimensional array
        image_data = numpy.reshape(image_data, (i_height, i_width, 3))

        images.append(image_data)

        progress = iend

    return images

def check_parallel_consistency(tries, input_pair=None):
    temp_dir = "/tmp/wasm_parallel_consistency_test/"
    os.makedirs(temp_dir, exist_ok=True)
    parallel_file = temp_dir + "/wasm_parallel"
    serial_file = temp_dir + "/wasm_serial"
    compile_wasm(1, parallel_file)
    compile_wasm(0, serial_file)

    for i in range(tries):
        # Make and log inputs:
        if input_pair == None:
            seed = random.randint(0, 400000000) + i
            print("Making inputs with seed: {}".format(seed))
            serial_input = get_random_input(seed, 1)
            parallel_input = get_random_input(seed)
        else:
            seed = "cmdline"
            #  print("Getting input from files given in command line: parallel: {}, serial: {}".format(*input_pair))
            serial_input = input_pair[1]
            parallel_input = input_pair[0]



        with open(temp_dir + "cpc_" + str(seed) + "_serial.stdin", "w") as fp:
            print(serial_input, file=fp)
        with open(temp_dir + "cpc_" + str(seed) + "_parallel.stdin", "w") as fp:
            print(parallel_input, file=fp)
        timing_file_prefix = temp_dir + "/cpc_" + str(seed) + "_timing"

        # Run serial process, parallel process with serial input, and parallel process:
        print("  Running serial process")
        ps = subprocess.Popen([serial_file, timing_file_prefix + "_serial.txt"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        (ps_out, stderr) = ps.communicate(serial_input)
        with open(temp_dir + "cpc_" + str(seed) + "_serial.stderr", "w") as fp:
            print(stderr, file=fp)


        print("  Running parallel process with serial input")
        pps = subprocess.Popen([parallel_file, timing_file_prefix + "_parallel_serial.txt"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        (pps_out, stderr) = pps.communicate(serial_input)
        with open(temp_dir + "cpc_" + str(seed) + "_parallel_serial.stderr", "w") as fp:
            print(stderr, file=fp)

        print("  Running parallel process")
        pp = subprocess.Popen([parallel_file, timing_file_prefix + "_parallel.txt"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)

        (pp_out, stderr) = pp.communicate(parallel_input)
        with open(temp_dir + "cpc_" + str(seed) + "_parallel.stderr", "w") as fp:
            print(stderr, file=fp)

        ps_ls = ps_out.split("\n")
        pps_ls = pps_out.split("\n")
        pp_ls = pp_out.split("\n")


        if (len(ps_ls) != len(pps_ls) or len(ps_ls) != len(pp_ls)):
            if sys.stdout.isatty():
                print("  \033[31mDifferent number of lines!\033[0m")
            else:
                print("  Different number of lines!")


        else:
            # Output should be equal betwen the 3 ways to calculate:
            if (ps_out != pps_out or ps_out != pp_out):
                if sys.stdout.isatty():
                    print("  \033[31mDifferent outputs!\033[0m")
                else:
                    print("  Different outputs!")
                # Save raw output:
                with open(temp_dir + "cpc_" + str(seed) + "_serial.stdout", "w") as fp:
                    print(ps_out, file=fp)
                with open(temp_dir + "cpc_" + str(seed) + "_parallel_serial.stdout", "w") as fp:
                    print(pps_out, file=fp)
                with open(temp_dir + "cpc_" + str(seed) + "_parallel.stdout", "w") as fp:
                    print(pp_out, file=fp)
                # Process images and et insights:

                ps_images, pps_images, pp_images = (*[parse_images(x) for x in [ps_ls, pps_ls, pp_ls]],)
                for j in range(len(ps_images)):
                    diff1 = abs(ps_images[j]  - pps_images[j])
                    diff2 = abs(pps_images[j] - pp_images[j])
                    diff3 = abs(pp_images[j]  - ps_images[j])
                    imageScale = max(numpy.max(diff1), numpy.max(diff2), numpy.max(diff3))

                    outImage = (pp_images[j] - ps_images[j]) / (imageScale + 1) * 127 + 128
                    pilI = Image.fromarray(outImage.astype(numpy.uint8))
                    pilI.save(temp_dir + "/compare{}_{}.png".format(seed, j))

                    print("  Image shape: {} > Serial Program Images  (mean:{:.3E}/ std: {:5.2f}/ sum: {:.3E}) Parallel Program with Serial Input Images (mean:{:.3E}/ std: {:5.2f}/ sum: {:.3E}) Paralle Program Images (mean:{:.3E}/ std: {:5.2f}/ sum: {:.3E})".format(
                        str(diff1.shape),
                        numpy.mean(diff1),
                        numpy.std(diff1),
                        numpy.sum(diff1),
                        numpy.mean(diff2),
                        numpy.std(diff2),
                        numpy.sum(diff2),
                        numpy.mean(diff3),
                        numpy.std(diff3),
                        numpy.sum(diff3),
                    ))
            else:
                print("    Outputs match!")
                serial_timings = [float(x) for x in open(timing_file_prefix + "_serial.txt", "r").readlines()]
                sparallel_timings = [(int(x.split(",")[0]), float(x.split(",")[1])) for x in open(timing_file_prefix + "_parallel_serial.txt", "r").readlines()]
                parallel_timings = [(int(x.split(",")[0]), float(x.split(",")[1])) for x in open(timing_file_prefix + "_parallel.txt", "r").readlines()]

                for i in range(0, len(parallel_timings)):
                    print("    Threads: {:4d}, Parallelization Overhead: {:8.5f}s, Parallelization Speedup: {:8.5f}, Parallelization Speedup per thread: {:8.5f}".format(parallel_timings[i][0],sparallel_timings[i][1] - serial_timings[i], serial_timings[i]/parallel_timings[i][1], serial_timings[i]/parallel_timings[i][1]/parallel_timings[i][0]))

if __name__ == '__main__':
    if len(sys.argv) > 1:
        parallel_input = open(sys.argv[1]).read()
        serial_input = open(sys.argv[2]).read()

        check_parallel_consistency(1, (parallel_input, serial_input))
    else:
        check_parallel_consistency(100)

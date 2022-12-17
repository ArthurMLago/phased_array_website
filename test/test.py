import subprocess
import random
import tempfile
import time
import os
import pdb
import sys

def compile_wasm(parallel, outfile):
    p = subprocess.Popen(["g++", "wasm.cpp", "-DPARALLEL_ENABLED=" + str(parallel), "-DTEST=1", "-o", outfile, "-O3"])
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
    nAnt = random.randint(1,128)
    outputString += "{:d}\n".format(nAnt)
    outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # startX
    outputString += "{:f}\n".format(random.uniform(-1e3,1e3)) # stattY
    outputString += "{:f}\n".format(random.uniform(1e-8,1e3)) # drawScale
    outputString += "{:d}\n".format(random.randint(1, 32)) # resolution
    outputString += "{:d}\n".format(random.randint(1, 8000)) # width
    outputString += "{:d}\n".format(random.randint(1, 8000)) # height
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
        op = random.choice(["update", "mag", "field"])
        outputString += op + "\n"
        if (op == "update"):
            outputString += get_random_config(random.randint(0,1532342342), nthreads)
        elif (op == "field"):
            outputString += str(random.uniform(0, 1e5)) + "\n"

    outputString += "end\n"
    return outputString



def check_parallel_consistency(tries):
    temp_dir = "/tmp/wasm_parallel_consistency_test/"
    os.makedirs(temp_dir, exist_ok=True)
    parallel_file = temp_dir + "/wasm_parallel"
    serial_file = temp_dir + "/wasm_serial"
    compile_wasm(1, parallel_file)
    compile_wasm(0, serial_file)

    for i in range(tries):
        # Make and log inputs:
        seed = random.randint(0, 400000000) + i
        print("Making inputs with seed: {}".format(seed))
        serial_input = get_random_input(seed, 1)
        parallel_input = get_random_input(seed)
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

        # Output should be equal betwen the 3 ways to calculate:
        if (ps_out != pps_out or ps_out != pp_out):
            if sys.stdout.isatty():
                print("  \033[31mDifferent outputs!\033[0m")
            else:
                print("  Different outputs!")
            with open(temp_dir + "cpc_" + str(seed) + "_serial.stdout", "w") as fp:
                print(ps_out, file=fp)
            with open(temp_dir + "cpc_" + str(seed) + "_parallel_serial.stdout", "w") as fp:
                print(pps_out, file=fp)
            with open(temp_dir + "cpc_" + str(seed) + "_parallel.stdout", "w") as fp:
                print(pp_out, file=fp)
        else:
            serial_timings = [float(x) for x in open(timing_file_prefix + "_serial.txt", "r").readlines()]
            sparallel_timings = [float(x) for x in open(timing_file_prefix + "_parallel_serial.txt", "r").readlines()]
            parallel_timings = [float(x) for x in open(timing_file_prefix + "_parallel.txt", "r").readlines()]

            for i in range(0, len(parallel_timings)):
                print("    Parallelization Overhead: {}, Parallelization Speedup: {}".format(sparallel_timings[i] - serial_timings[i], serial_timings[i]/parallel_timings[i]))




if __name__ == '__main__':
    check_parallel_consistency(100)

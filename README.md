# Phased Array Simulation Website
## What is this
This is the source code for the page at [https://phasedarray.mlago.dev](https://phasedarray.mlago.dev), a small website with cool animations and diagrams for explaining phased arrays.

I constantly had to explain phased arrays to people, and always tought that the common gif at wikipedia was just not cutting it, there was som much more I wanted to show graphically, to the point I invented multiple analogies with swimming pools(and mechanical waves in the water). I ended up getting fed up enough to make this website, exactly the way I imagine phased arrays.

It has a couple cool features that I think are not that common, namely, you can draw the magnitudes of fields, and the fields themselves at any point of the canvas, making it possible to watch near field antenna effects, watch how electromagnetic waves propagate and interfere, etc.

This website uses webassembly to perform the magnitudes and fields drawing, which are very compute intensive, the source code for these calculations were written in C++, and I will not be surprised if someone comes along and tells me there are much better ways to get the result out of wasm memory to the canvas.

## Building and deploying

**emsdk version used: 3.1.28**

Build and deployment are entirely compromised in `deploy.sh`, but to run it, you need to have emsdk of the appropriate enabled and sourced.


import struct
import sys

with open(sys.argv[1], 'rb') as f:
    # Read the width and height values from the first 8 bytes of the file (2 uint32_t values)
    width, height = struct.unpack('II', f.read(8))

    # Read the remaining float data into memory
    data = f.read()
print(width, height)

# iterate over each row and print the values
for i in range(height):
    start_idx = i * width * 4  # width floats per row, 4 bytes per float
    end_idx = start_idx + width * 4
    row_data = data[start_idx:end_idx]  # extract the floats for this row
    row = struct.unpack(f"{width}f", row_data)  # unpack the floats into a tuple
    print(f"Row {i+1}:")
    for j in range(0, width, 20):
        print(*[f"{x:.7f}" for x in row[j:j+20]])  # print 20 values at a time
    print()

#!/usr/bin/env python
"""Quantize ONNX models to INT8/INT4 during download pipeline.

Usage:
    python -m backend.scripts.quantize_onnx <model_path> [--int4]

The script uses ONNX Runtime's quantization tools to convert FP32/FP16 ONNX
models to INT8 (default) or INT4 quantization. The quantized model replaces
the original file.
"""

import argparse
import sys
from pathlib import Path

try:
    import onnx
    from onnxruntime.quantization import QuantType, quantize_dynamic
except ImportError as e:
    print(f"Missing dependencies: {e}")
    print("Install with: pip install onnx onnxruntime onnxruntime-quantization")
    sys.exit(1)


def quantize_onnx_model(
    model_path: Path,
    output_path: Path | None = None,
    weight_type=QuantType.QInt8,
    per_channel=True,
    reduce_range=False,
) -> Path:
    """Quantize ONNX model to INT8 (default) or INT4.

    Args:
        model_path: Path to the input ONNX model
        output_path: Optional output path (defaults to model_path.with_suffix(".int8.onnx"))
        weight_type: QuantType.QInt8 (default) or QuantType.QInt4
        per_channel: Whether to quantize per-channel (default True)
        reduce_range: Whether to reduce range for QInt8 (default False for better accuracy)

    Returns:
        Path to the quantized model
    """
    if output_path is None:
        output_path = model_path.with_suffix(".int8.onnx")

    print(f"Quantizing {model_path} -> {output_path} (weight_type={weight_type})")

    # Load and validate model
    model = onnx.load(str(model_path))
    onnx.checker.check_model(model)

    # Quantize
    quantize_dynamic(
        model_input=str(model_path),
        model_output=str(output_path),
        weight_type=weight_type,
        per_channel=True,
        reduce_range=reduce_range,
        optimize_model=True,
    )

    # Verify quantized model
    quantized_model = onnx.load(str(output_path))
    onnx.checker.check_model(quantized_model)

    print(f"Quantization complete: {output_path}")
    return output_path


def main():
    parser = argparse.ArgumentParser(description="Quantize ONNX model to INT8/INT4")
    parser.add_argument("model_path", type=Path, help="Path to ONNX model file")
    parser.add_argument("--int4", action="store_true", help="Use INT4 quantization (default: INT8)")
    parser.add_argument("-o", "--output", type=Path, help="Output path (default: <input>.int8.onnx)")
    parser.add_argument("--per-channel", action="store_true", default=True, help="Per-channel quantization")
    parser.add_argument("--reduce-range", action="store_true", help="Reduce range for INT8 (less accurate)")

    args = parser.parse_args()

    if not args.model_path.exists():
        print(f"Error: Model not found: {args.model_path}")
        sys.exit(1)

    weight_type = QuantType.QInt4 if args.int4 else QuantType.QInt8

    try:
        output = quantize_onnx_model(
            model_path=args.model_path,
            output_path=args.output,
            weight_type=weight_type,
            per_channel=args.per_channel,
            reduce_range=args.reduce_range,
        )
        print(f"Success: {output}")
    except Exception as e:
        print(f"Quantization failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

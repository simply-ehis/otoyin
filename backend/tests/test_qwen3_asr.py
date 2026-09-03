"""
Regression test for the Qwen3-ASR backend stub.

The original backend treated the encoder's hidden-state output as token IDs and
never invoked the decoder, producing garbage. This exercises the corrected
autoregressive decoder (decoder_init prefill -> decoder_step loop over KV cache)
with mocked ONNX sessions, so it runs without downloading the real model.
"""

import asyncio

import numpy as np
import pytest

from backend.backends.qwen3_asr_backend import Qwen3ASRBackend


class _Node:
    def __init__(self, name, shape=None):
        self.name = name
        self.shape = shape or []


class _FakeSession:
    def __init__(self, inputs, outputs, plan):
        self._inputs = inputs
        self._outputs = outputs
        self._plan = plan

    def get_inputs(self):
        return self._inputs

    def get_outputs(self):
        return self._outputs

    def run(self, _feed, inputs):
        return self._plan(inputs)


VOCAB = 200
HIDDEN = 16


def _encoder_session():
    return _FakeSession(
        [_Node("input_features", [1, 128, -1])],
        [_Node("hidden", [1, -1, 16])],
        plan=lambda inp: [np.zeros((1, 10, HIDDEN), dtype=np.float32)],
    )


def _init_session():
    inputs = [_Node("input_ids"), _Node("encoder_hidden_states")]
    outputs = [
        _Node("logits"),
        _Node("past_key_values.0.key"),
        _Node("past_key_values.0.value"),
    ]

    def plan(inp):
        logits = np.zeros((1, 1, VOCAB), dtype=np.float32)
        logits[0, 0, 100] = 1.0  # force next token = 100
        return [
            logits,
            np.zeros((1, 1, HIDDEN), dtype=np.float32),
            np.zeros((1, 1, HIDDEN), dtype=np.float32),
        ]

    return _FakeSession(inputs, outputs, plan)


def _step_session():
    inputs = [
        _Node("input_embeds"),
        _Node("past_key_values.0.key"),
        _Node("past_key_values.0.value"),
    ]
    outputs = [
        _Node("logits"),
        _Node("past_key_values.0.key"),
        _Node("past_key_values.0.value"),
    ]

    def plan(inp):
        logits = np.zeros((1, 1, VOCAB), dtype=np.float32)
        logits[0, 0, 5] = 1.0  # force next token = EOS (5)
        return [
            logits,
            np.zeros((1, 1, HIDDEN), dtype=np.float32),
            np.zeros((1, 1, HIDDEN), dtype=np.float32),
        ]

    return _FakeSession(inputs, outputs, plan)


@pytest.fixture
def backend():
    b = Qwen3ASRBackend()
    b.session = True
    b._encoder_session = _encoder_session()
    b._decoder_init = _init_session()
    b._decoder_step = _step_session()
    b._embed_tokens = np.zeros((VOCAB, HIDDEN), dtype=np.float32)
    b._tokenizer = {"model": {"vocab": {"hi": 100}}}
    b._eos_ids = {5}
    b._start_id = 1
    b._max_len = 10
    b._map_decoder_io()
    return b


def test_decode_loop_runs_prefill_then_step(backend):
    hidden = np.zeros((1, 10, HIDDEN), dtype=np.float32)
    generated = backend._decode_loop(hidden)
    # start token + one decoded token, then EOS triggers break.
    assert generated == [1, 100]


def test_decode_tokens_handles_space_and_byte_fallback(backend):
    backend._tokenizer = {
        "model": {
            "vocab": {
                "hi": 100,
                "Ġthere": 101,
                "<0x21>": 102,  # '!'
            }
        }
    }
    text = backend._decode_tokens(np.array([100, 101, 102], dtype=np.int64))
    assert text == "hi there!"


def test_transcribe_end_to_end_with_mocked_io(backend, monkeypatch):
    import numpy as np

    monkeypatch.setattr(
        "backend.utils.audio.load_audio",
        lambda path: (np.zeros(16000, dtype=np.float32), 16000),
    )
    monkeypatch.setattr(backend, "_audio_to_features", lambda audio: np.zeros((1, 128, 10), dtype=np.float32))
    text = asyncio.run(backend.transcribe("dummy.wav"))
    assert text == "hi"

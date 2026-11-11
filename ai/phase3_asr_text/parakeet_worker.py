"""
Stand-alone script, run as a SUBPROCESS by parakeet_asr.py.
 
It can live in a separate NeMo virtualenv (NeMo pins many packages) - point
phase3.parakeet.python_executable in config.yaml at that venv's python.
 
    python parakeet_worker.py --model nvidia/parakeet-tdt-0.6b-v2 --inputs in.json --output out.json
 
in.json  : ["seg1.wav", "seg2.wav", ...]
out.json : ["text 1", "text 2", ...]   (same order)
"""
 
import argparse
import json
 
 
def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--inputs", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--batch-size", type=int, default=8)
    args = parser.parse_args()
 
    import nemo.collections.asr as nemo_asr
    import torch
 
    with open(args.inputs, encoding="utf-8") as f:
        paths = json.load(f)
 
    model = nemo_asr.models.ASRModel.from_pretrained(model_name=args.model)
    if torch.cuda.is_available():
        model = model.cuda()
    model.eval()
 
    outputs = model.transcribe(paths, batch_size=args.batch_size)
    if isinstance(outputs, tuple):          # some NeMo versions return (best, all)
        outputs = outputs[0]
    texts = [str(getattr(o, "text", o)).strip() for o in outputs]
 
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(texts, f, ensure_ascii=False)
 
 
if __name__ == "__main__":
    main()



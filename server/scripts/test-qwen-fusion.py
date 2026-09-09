"""
Free-tier-safe test of real two-person photo fusion via Hugging Face's
Inference Providers (routed to fal.ai), NOT the ZeroGPU Space UI that hit
its quota wall earlier. Uses the exact prompt amora-server's
buildFusionPrompt() would generate for Golden Hour + Realistic + Couple,
so this is a genuine test of the production prompt, not a stand-in.

Verified against the REAL installed huggingface_hub source (not guessed):
- client.image_to_image()'s **kwargs get merged into `parameters`, which
  FalAIImageToImageTask._prepare_payload_as_dict spreads into the request
  payload AFTER the auto-built single-image "image_urls" key — so passing
  image_urls=[uriA, uriB] here overrides that with our real two images.
  (huggingface_hub/inference/_providers/fal_ai.py, FalAIImageToImageTask)

Setup:
  pip install huggingface_hub pillow python-dotenv
  echo HF_TOKEN=hf_xxx > .env   # a free HF token, "Inference Providers" scope only
  # drop a real "faceA.png" (any face photo) next to this script, then:
  python test-qwen-fusion.py

Actual run result (2026-09-02, this account): 2 requests, $0.05 of usage,
$0.00 billed — inside HF's free monthly inference allowance, no card
charged. Output kept both faces recognizable with unified golden-hour
lighting across the composite. One real issue found and since fixed here
and in the real promptBuilder.ts: the man's reference photo (generated as
"shoulder-up" with no clothing specified) came out shirtless, and that
carried into the fused result.
"""
import base64
import os

from dotenv import load_dotenv
from huggingface_hub import InferenceClient

load_dotenv()  # reads HF_TOKEN from the .env file in this directory

client = InferenceClient(provider="fal-ai", api_key=os.environ["HF_TOKEN"])

FACE_A = "faceA.png"
FACE_B = "faceB.png"

# --- Step 1: face B (the earlier ZeroGPU Space attempt for this failed on quota) ---
if not os.path.exists(FACE_B):
    print("Generating face B via Qwen/Qwen-Image (text-to-image, fal-ai provider)...")
    face_b_image = client.text_to_image(
        "photorealistic portrait photo of a fictional young man in his mid-20s, "
        "wearing a plain crew-neck t-shirt, shoulder-up, plain neutral studio "
        "background, soft even lighting, looking at camera, no text or watermark",
        model="Qwen/Qwen-Image",
    )
    face_b_image.save(FACE_B)
    print(f"Saved {FACE_B}")


def data_uri(path: str, mime: str = "image/png") -> str:
    with open(path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode()
    return f"data:{mime};base64,{b64}"


uri_a = data_uri(FACE_A)
uri_b = data_uri(FACE_B)

# The exact string amora-server/src/lib/promptBuilder.ts's buildFusionPrompt()
# produces for { subjectMode: 'COUPLE', templateId: 'goldenHour', styleKey: 'realistic' }
FUSION_PROMPT = (
    "Combine the two people from the reference photos into a single new photo "
    "of them together, as a couple. Preserve each person's real face and "
    "identity exactly as shown in their reference photo — do not blend or "
    "average their features into a new face. Scene: a warm golden-hour "
    "sunset, soft low sunlight, long shadows. Style: photorealistic, natural "
    "skin texture and lighting, shot on a real camera. Compose it as a "
    "vertical phone wallpaper, both people fully visible, natural consistent "
    "lighting across the whole image. Keep each person dressed appropriately "
    "and consistent with their reference photo — do not remove or alter "
    "their clothing."
)

print("Requesting two-person fusion via Qwen-Image-Edit-2511 (fal-ai provider)...")
result = client.image_to_image(
    uri_a,
    prompt=FUSION_PROMPT,
    model="Qwen/Qwen-Image-Edit-2511",
    image_urls=[uri_a, uri_b],  # overrides the single-image default — see module docstring
)
result.save("couple_fusion_result.png")
print("Saved couple_fusion_result.png")

"""Labels, severity weights and JSON schemas for Phase 7 (newer conversation-analysis script)."""
 
from phase5_text_behaviour_analysis.labels import (  # noqa: F401  (same as Phase 5)
    ALL_BEHAVIOURS, BEHAVIOUR_SCHEMA, COMPLETION_STATUSES, ENTITY_CATEGORIES, INTEREST_LEVELS,
    NEGATIVE_BEHAVIOURS, POSITIVE_BEHAVIOURS, RESOLUTION_STATUSES, REVIEW_LABELS, ROLE_STEP_SCHEMA)
from phase5_text_behaviour_analysis.labels import SUMMARY_SCHEMA as _P5_SUMMARY_SCHEMA
 
FOLLOW_UP_VALUES = ["recommended", "required", "not_required", "unclear"]
 
# Fixed severity weights: primary-behaviour choice and review order.
# "unclear_text" is a review-flag label (garbled line), lowest priority.
SEVERITY_WEIGHTS = {
    "threatening": 100,
    "abusive": 90,
    "aggressive": 80,
    "hostile": 70,
    "rude": 60,
    "angry": 50,
    "frustrated": 40,
    "dismissive": 30,
    "impatient": 20,
    "unclear_text": 10,
}
 
# Summary schema = Phase 5 schema + "follow_up"
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {**_P5_SUMMARY_SCHEMA["properties"],
                   "follow_up": {"type": "string", "enum": FOLLOW_UP_VALUES}},
    "required": [r for r in _P5_SUMMARY_SCHEMA["required"] if r not in ("customer_interest", "entities")]
                + ["follow_up", "customer_interest", "entities"],
}
 
# ---------------- line-by-line tone check ----------------
SEGMENT_TONE_LABELS = ["polite", "neutral", "impolite", "abusive", "threatening", "unclear"]
 
SEGMENT_TONE_SCHEMA = {
    "type": "object",
    "properties": {
        "segments": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                    "english": {"type": "string"},
                    "tone": {"type": "string", "enum": SEGMENT_TONE_LABELS},
                },
                "required": ["id", "english", "tone"],
            },
        }
    },
    "required": ["segments"],
}
 
TONE_TO_LABEL = {"impolite": "rude", "abusive": "abusive", "threatening": "threatening"}
TONE_SEVERITY = ["threatening", "abusive", "impolite"]          # most severe first
UNCLEAR_REVIEW_LABEL = "unclear_text"



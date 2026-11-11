"""Behaviour labels, interest levels, entity categories and the JSON schemas sent to Ollama."""
 
POSITIVE_BEHAVIOURS = ["empathetic", "cooperative", "professional", "calm"]
 
NEGATIVE_BEHAVIOURS = ["frustrated", "angry", "impatient", "dismissive", "rude",
                       "abusive", "aggressive", "threatening", "hostile"]
 
ALL_BEHAVIOURS = POSITIVE_BEHAVIOURS + NEGATIVE_BEHAVIOURS
 
# Negative labels that trigger human review when the evidence quote is verified
REVIEW_LABELS = set(NEGATIVE_BEHAVIOURS)
 
INTEREST_LEVELS = ["highly_interested", "interested", "just_listening", "not_interested", "not_clear"]
 
ENTITY_CATEGORIES = ["customer_name", "agent_name", "company_names", "locations", "product_names",
                     "service_names", "person_names", "dates_and_times", "contact_information",
                     "other_entities"]
 
RESOLUTION_STATUSES = ["resolved", "partially_resolved", "unresolved", "pending", "unknown"]
COMPLETION_STATUSES = ["complete", "incomplete", "uncertain"]
 
_STR_LIST = {"type": "array", "items": {"type": "string"}}
 
_BASE_SUMMARY_PROPERTIES = {
    "language": {"type": "string"},
    "agent_speaker": {"type": "string"},
    "client_speaker": {"type": "string"},
    "summary": {"type": "string"},
    "main_topic": {"type": "string"},
    "customer_concerns": _STR_LIST,
    "customer_requests": _STR_LIST,
    "agent_actions": _STR_LIST,
    "agreements": _STR_LIST,
    "important_details": _STR_LIST,
    "unresolved_issues": _STR_LIST,
    "resolution_status": {"type": "string", "enum": RESOLUTION_STATUSES},
    "conversation_completion": {"type": "string", "enum": COMPLETION_STATUSES},
}
_BASE_REQUIRED = list(_BASE_SUMMARY_PROPERTIES.keys())
 
# Schema of the ORIGINAL short summary step - used only to find the speaker roles
ROLE_STEP_SCHEMA = {
    "type": "object",
    "properties": _BASE_SUMMARY_PROPERTIES,
    "required": _BASE_REQUIRED,
}
 
SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        **_BASE_SUMMARY_PROPERTIES,
        "customer_interest": {
            "type": "object",
            "properties": {
                "level": {"type": "string", "enum": INTEREST_LEVELS},
                "evidence": _STR_LIST,
            },
            "required": ["level", "evidence"],
        },
        "entities": {
            "type": "object",
            "properties": {c: _STR_LIST for c in ENTITY_CATEGORIES},
            "required": ENTITY_CATEGORIES,
        },
    },
    "required": _BASE_REQUIRED + ["customer_interest", "entities"],
}
 
BEHAVIOUR_SCHEMA = {
    "type": "object",
    "properties": {
        "behaviours": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string", "enum": ALL_BEHAVIOURS},
                    "reason": {"type": "string"},
                    "evidence": {"type": "string"},
                },
                "required": ["label", "reason", "evidence"],
            },
        },
        "primary_behaviour": {"type": "string", "enum": ALL_BEHAVIOURS + ["neutral"]},
        "reason": {"type": "string"},
    },
    "required": ["behaviours", "primary_behaviour", "reason"],
}

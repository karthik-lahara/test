from enum import Enum
from typing import Any, Dict, Optional
 
 
class ErrorCode(str, Enum):
    GEN_001_CONFIG_NOT_FOUND = "GEN_001"
    GEN_002_CONFIG_INVALID = "GEN_002"
    GEN_003_DEPENDENCY_MISSING = "GEN_003"
    GEN_004_IO_ERROR = "GEN_004"
    GEN_999_UNKNOWN = "GEN_999"
 
    P1_001_INPUT_NOT_FOUND = "P1_001"
    P1_002_UNSUPPORTED_FORMAT = "P1_002"
    P1_003_FILE_TOO_LARGE = "P1_003"
    P1_004_FILE_EMPTY = "P1_004"
    P1_005_DECODE_FAILED = "P1_005"
    P1_006_TOO_SHORT = "P1_006"
    P1_007_TOO_LONG = "P1_007"
    P1_008_SILENT_AUDIO = "P1_008"
    P1_009_RESAMPLE_FAILED = "P1_009"
    P1_010_DENOISE_FAILED = "P1_010"
    P1_011_NORMALIZE_FAILED = "P1_011"
    P1_012_TRIM_FAILED = "P1_012"
    P1_013_SAVE_FAILED = "P1_013"
    P1_014_DOWNLOAD_FAILED = "P1_014"
    P1_015_URL_EXPIRED = "P1_015"
 
    P2_001_INPUT_NOT_FOUND = "P2_001"
    P2_002_HF_TOKEN_MISSING = "P2_002"
    P2_003_MODEL_LOAD_FAILED = "P2_003"
    P2_004_DIARIZATION_FAILED = "P2_004"
    P2_005_NO_SPEECH_FOUND = "P2_005"
    P2_006_POSTPROCESS_FAILED = "P2_006"
    P2_007_EXPORT_FAILED = "P2_007"
    P2_008_GPU_OUT_OF_MEMORY = "P2_008"

    # ---------------- Phase 3 ----------------
    P3_001_INPUT_NOT_FOUND = "P3_001"
    P3_002_LANGUAGE_DETECTION_FAILED = "P3_002"
    P3_003_UNSUPPORTED_LANGUAGE = "P3_003"
    P3_004_INDIC_MODEL_FAILED = "P3_004"
    P3_005_PARAKEET_FAILED = "P3_005"
    P3_006_ALL_SEGMENTS_FAILED = "P3_006"
    P3_007_SAVE_FAILED = "P3_007"


    # ---------------- Phase 4 ----------------
    P4_001_INPUT_NOT_FOUND = "P4_001"
    P4_002_MODEL_LOAD_FAILED = "P4_002"
    P4_003_TRANSLATION_FAILED = "P4_003"
    P4_004_GPU_OUT_OF_MEMORY = "P4_004"
    P4_005_SAVE_FAILED = "P4_005"


    # ---------------- Phase 4b ----------------
    P4B_001_INPUT_NOT_FOUND = "P4B_001"
    P4B_002_MODEL_LOAD_FAILED = "P4B_002"
    P4B_003_CLASSIFICATION_FAILED = "P4B_003"
    P4B_004_SAVE_FAILED = "P4B_004"


    # ---------------- Phase 5 ----------------
    P5_001_INPUT_NOT_FOUND = "P5_001"
    P5_002_OLLAMA_UNAVAILABLE = "P5_002"
    P5_003_ANALYSIS_FAILED = "P5_003"
    P5_004_SAVE_FAILED = "P5_004"

    # ---------------- Phase 6 ----------------
    P6_001_INPUT_NOT_FOUND = "P6_001"
    P6_002_MODEL_LOAD_FAILED = "P6_002"
    P6_003_NO_USABLE_UNITS = "P6_003"
    P6_004_SAVE_FAILED = "P6_004"


    # ---------------- Phase 7 ----------------
    P7_001_INPUT_NOT_FOUND = "P7_001"
    P7_002_OLLAMA_UNAVAILABLE = "P7_002"
    P7_003_ANALYSIS_FAILED = "P7_003"
    P7_004_SAVE_FAILED = "P7_004"


class PipelineError(Exception):
    phase: str = "general"
 
    def __init__(self, code: ErrorCode, message: str,
                 details: Optional[Dict[str, Any]] = None, phase: Optional[str] = None):
        super().__init__(f"[{code.value}] {message}")
        self.code = code
        self.message = message
        self.details = details or {}
        if phase:
            self.phase = phase
 
    def to_dict(self) -> Dict[str, Any]:
        return {
            "error_code": self.code.value,
            "error_name": self.code.name,
            "phase": self.phase,
            "message": self.message,
            "details": self.details,
        }
 
 
class ConfigError(PipelineError):
    phase = "general"
 
 
class AudioPreparationError(PipelineError):
    phase = "phase1_audio_preparation"
 
 
class DiarizationError(PipelineError):
    phase = "phase2_speaker_diarization"

    
class ASRError(PipelineError):
    phase = "phase3_asr_text"    

class TranslationError(PipelineError):
    phase = "phase4_language_translation"    

class RoleIdentificationError(PipelineError):
    phase = "phase4b_speaker_roles"

class TextBehaviourError(PipelineError):
    phase = "phase5_text_behaviour_analysis"   

class VoiceBehaviourError(PipelineError):
    phase = "phase6_voice_behaviour_analysis"    

class OverallAnalysisError(PipelineError):
    phase = "phase7_overall_conversation_analysis"


import abc
from google import genai
from backend.core.config import settings

class BaseLLMProvider(abc.ABC):
    @abc.abstractmethod
    async def generate(self, prompt: str, logical_model: str) -> str:
        """Generates text from the LLM provider based on the given prompt and logical model."""
        pass

class GeminiProvider(BaseLLMProvider):
    def __init__(self):
        # Initializes the client using ADC or the provided API key
        self.client = genai.Client(api_key=settings.gemini_api_key)
        
    async def generate(self, prompt: str, logical_model: str) -> str:
        actual_model = settings.model_map_gemini.get(logical_model, "gemini-1.5-flash")
        
        try:
            # We use a synchronous SDK call wrapped in a thread for async compatibility
            import asyncio
            response = await asyncio.to_thread(
                self.client.models.generate_content,
                model=actual_model,
                contents=prompt
            )
            return response.text
        except Exception as e:
            raise RuntimeError(f"Gemini API error: {e}")

from ollama import AsyncClient as OllamaAsyncClient

class OllamaProvider(BaseLLMProvider):
    def __init__(self):
        self.client = OllamaAsyncClient(host=settings.ollama_host)

    async def generate(self, prompt: str, logical_model: str) -> str:
        actual_model = settings.model_map_ollama.get(logical_model, "gemma:2b")
        if actual_model == "not-supported":
            raise ValueError(f"Model role '{logical_model}' is not supported by Ollama")
            
        try:
            response = await self.client.generate(model=actual_model, prompt=prompt)
            return response['response']
        except Exception as e:
            raise RuntimeError(f"Ollama SDK error: {e}")

class MockProvider(BaseLLMProvider):
    async def generate(self, prompt: str, logical_model: str) -> str:
        return "FINDING: Mock Anomaly Detected\nEVIDENCE: Simulated vibration spike 40mm/s\nCONFIDENCE: 0.99"

def get_llm_provider() -> BaseLLMProvider:
    """Factory function to get the configured LLM provider."""
    provider_name = settings.ai_provider.lower()
    
    if provider_name == "ollama":
        return OllamaProvider()
    elif provider_name == "gemini":
        return GeminiProvider()
    else:
        return MockProvider()

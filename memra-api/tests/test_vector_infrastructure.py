from __future__ import annotations

from tests.conftest import make_test_settings


class TestVectorProviderSelection:
    def test_default_provider_is_qdrant(self):
        s = make_test_settings()
        assert s.vector_provider == "qdrant"

    def test_chroma_local_path_is_defined(self):
        s = make_test_settings(vector_provider="chroma")
        path = s.chroma_local_path
        assert path.name in {"memra-chroma-local", "chroma_local"}

    def test_get_vector_client_qdrant(self):
        from memra.infrastructure.vector import get_vector_client

        s = make_test_settings(vector_provider="qdrant")
        client = get_vector_client(s)
        assert client is not None

    def test_get_vector_client_non_qdrant_raises(self):
        from memra.infrastructure.vector import get_vector_client

        s = make_test_settings(vector_provider="nano", qdrant_url="")
        try:
            get_vector_client(s)
            assert False, "Expected RuntimeError for non-qdrant provider"
        except RuntimeError as exc:
            assert "qdrant" in str(exc).lower()

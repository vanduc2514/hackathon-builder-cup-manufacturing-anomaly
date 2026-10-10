"""Firestore Adapter: Manages Firestore client lifecycle, persistence, and reactive listeners."""

from __future__ import annotations

import logging
import os
from typing import Any, Callable

from google.auth.exceptions import DefaultCredentialsError, GoogleAuthError
from google.cloud import firestore

from backend.core.config import settings
from backend.core.models import IncidentState

logger = logging.getLogger(__name__)


class FirestoreAdapter:
    """Encapsulates Google Cloud Firestore operations with graceful emulator & local fallback."""

    def __init__(
        self,
        client: Any | None = None,
        project: str | None = None,
        collection: str | None = None,
        emulator_host: str | None = None,
        fallback_to_memory: bool | None = None,
    ) -> None:
        self._project = project or settings.gcp_project_id
        self._collection = collection or settings.firestore_collection
        self._fallback_to_memory = (
            fallback_to_memory
            if fallback_to_memory is not None
            else settings.firestore_fallback_to_memory
        )
        self._emulator_host = (
            emulator_host
            or settings.firestore_emulator_host
            or os.environ.get("FIRESTORE_EMULATOR_HOST")
        )

        if client is not None:
            self._client = client
        else:
            self._client = self._init_client()

    def _init_client(self) -> Any | None:
        """Initialises the Firestore client targeting emulator, production ADC, or mock fallback."""
        if self._emulator_host:
            # Strip protocol prefix if present for grpc Firestore client
            host = self._emulator_host
            if "://" in host:
                host = host.split("://", 1)[1]
            os.environ["FIRESTORE_EMULATOR_HOST"] = host
            try:
                client = firestore.Client(project=self._project)
                logger.info(
                    "Firestore client connected to emulator at %s (project: %s)",
                    host,
                    self._project,
                )
                return client
            except Exception as exc:
                if self._fallback_to_memory:
                    logger.warning(
                        "Firestore emulator connection failed (%s); falling back to in-memory board",
                        exc,
                    )
                    return None
                raise

        # Production Cloud Firestore (Application Default Credentials / Cloud Run IAM)
        try:
            client = firestore.Client(project=self._project)
            logger.info(
                "Firestore client connected to Cloud Firestore (project: %s)", self._project
            )
            return client
        except (DefaultCredentialsError, GoogleAuthError, Exception) as exc:
            if self._fallback_to_memory:
                logger.info(
                    "Firestore credentials unavailable (%s); operating with in-memory Blackboard",
                    type(exc).__name__,
                )
                return None
            raise

    @property
    def client(self) -> Any | None:
        return self._client

    @property
    def is_enabled(self) -> bool:
        return self._client is not None

    @property
    def collection_name(self) -> str:
        return self._collection

    def save_incident(self, incident: IncidentState) -> bool:
        """Persists the complete IncidentState document to /incidents/{incident_id}."""
        if not self.is_enabled:
            return False

        try:
            payload = incident.model_dump(mode="json")
            doc_ref = self._client.collection(self._collection).document(incident.incident_id)
            doc_ref.set(payload)
            logger.debug(
                "Persisted incident %s (status: %s) to Firestore",
                incident.incident_id,
                incident.status,
            )
            return True
        except Exception as exc:
            logger.warning(
                "Failed to persist incident %s to Firestore: %s", incident.incident_id, exc
            )
            return False

    def get_incident(self, incident_id: str) -> IncidentState | None:
        """Retrieves and validates an incident document by ID from Firestore."""
        if not self.is_enabled:
            return None

        try:
            doc_ref = self._client.collection(self._collection).document(incident_id)
            doc = doc_ref.get()
            if not doc.exists:
                return None
            data = doc.to_dict()
            if not data:
                return None
            return IncidentState.model_validate(data)
        except Exception as exc:
            logger.warning("Failed to retrieve incident %s from Firestore: %s", incident_id, exc)
            return None

    def get_open_incident(self) -> IncidentState | None:
        """Finds the most recently active non-closed incident document."""
        if not self.is_enabled:
            return None

        try:
            coll_ref = self._client.collection(self._collection)
            try:
                query = coll_ref.order_by("updated_at", direction=firestore.Query.DESCENDING).limit(
                    20
                )
                docs = list(query.stream())
            except Exception:
                docs = list(coll_ref.limit(20).stream())

            for doc in docs:
                data = doc.to_dict()
                if not data:
                    continue
                status = data.get("status")
                # Active open statuses: anything except normal baseline, closed or dismissed
                if status and status not in ("normal", "closed", "dismissed"):
                    return IncidentState.model_validate(data)
            return None
        except Exception as exc:
            logger.warning("Failed to query open incidents from Firestore: %s", exc)
            return None

    def attach_listener(
        self, incident_id: str, callback: Callable[[IncidentState], None]
    ) -> Callable[[], None] | None:
        """Subscribes to live document snapshot updates from Firestore."""
        if not self.is_enabled:
            return None

        try:
            doc_ref = self._client.collection(self._collection).document(incident_id)

            def _on_snapshot(doc_snapshot, changes, read_time):
                for doc in doc_snapshot:
                    if doc.exists:
                        data = doc.to_dict()
                        if data:
                            try:
                                state = IncidentState.model_validate(data)
                                callback(state)
                            except Exception as exc:
                                logger.warning(
                                    "Failed to parse Firestore snapshot for %s: %s",
                                    incident_id,
                                    exc,
                                )

            watch = doc_ref.on_snapshot(_on_snapshot)

            def unsubscribe() -> None:
                try:
                    watch.unsubscribe()
                except Exception:
                    pass

            return unsubscribe
        except Exception as exc:
            logger.warning("Failed to attach snapshot listener for %s: %s", incident_id, exc)
            return None

    def delete_incident(self, incident_id: str) -> bool:
        """Deletes an incident document from Firestore (useful for test cleanup)."""
        if not self.is_enabled:
            return False

        try:
            self._client.collection(self._collection).document(incident_id).delete()
            return True
        except Exception as exc:
            logger.warning("Failed to delete incident %s from Firestore: %s", incident_id, exc)
            return False


_adapter_singleton: FirestoreAdapter | None = None


def get_firestore_adapter() -> FirestoreAdapter:
    """Returns singleton FirestoreAdapter instance."""
    global _adapter_singleton
    if _adapter_singleton is None:
        _adapter_singleton = FirestoreAdapter()
    return _adapter_singleton


def reset_firestore_adapter() -> None:
    """Resets the singleton adapter (testing utility)."""
    global _adapter_singleton
    _adapter_singleton = None

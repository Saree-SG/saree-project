"""
chat_service.py — backward-compat shim.

Business logic has been moved to:
  app.services.chat_service.ChatService   (async)
  app.repositories.chat_repository        (async)

This module is kept empty to avoid import errors from other places
that may still reference it. Delete when all imports are updated.
"""

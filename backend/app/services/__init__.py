"""
Service layer — orchestrates business logic.

Services own the transaction boundary (begin → commit/rollback).
Services call repositories for all DB access.
Services MUST NOT expose session to routes.
"""

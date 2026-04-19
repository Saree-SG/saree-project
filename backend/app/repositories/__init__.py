"""
Repository layer — strict async DB access.

Every module that needs DB access MUST go through a repository.
Routes and services MUST NOT call session.execute/add/delete/commit directly.
"""

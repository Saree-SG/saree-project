from fastapi.testclient import TestClient

from app.core.config import settings


def expected_api_operations() -> list[tuple[str, str]]:
    """Return expected (method, path) pairs from backend route definitions."""
    api = settings.API_V1_STR
    operations: list[tuple[str, str]] = [
        ("post", f"{api}/login/access-token"),
        ("post", f"{api}/login/refresh-token"),
        ("post", f"{api}/login/logout"),
        ("post", f"{api}/login/test-token"),
        ("post", f"{api}/password-recovery/{{email}}"),
        ("post", f"{api}/reset-password/"),
        ("post", f"{api}/password-recovery-html-content/{{email}}"),
        ("get", f"{api}/users/"),
        ("post", f"{api}/users/"),
        ("patch", f"{api}/users/me"),
        ("patch", f"{api}/users/me/password"),
        ("get", f"{api}/users/me"),
        ("delete", f"{api}/users/me"),
        ("post", f"{api}/users/signup"),
        ("get", f"{api}/users/{{user_id}}"),
        ("patch", f"{api}/users/{{user_id}}"),
        ("delete", f"{api}/users/{{user_id}}"),
        ("post", f"{api}/utils/test-email/"),
        ("get", f"{api}/utils/health-check/"),
        ("get", f"{api}/projects/"),
        ("post", f"{api}/projects/"),
        ("get", f"{api}/projects/{{project_id}}"),
        ("patch", f"{api}/projects/{{project_id}}"),
        ("post", f"{api}/projects/{{project_id}}/level-config"),
        ("get", f"{api}/projects/{{project_id}}/level-config"),
        ("get", f"{api}/projects/{{project_id}}/members"),
        ("post", f"{api}/projects/{{project_id}}/members"),
        ("post", f"{api}/projects/{{project_id}}/tasks"),
        ("get", f"{api}/projects/{{project_id}}/tasks"),
        ("post", f"{api}/tasks/{{parent_id}}/children"),
        ("get", f"{api}/tasks/{{task_id}}"),
        ("patch", f"{api}/tasks/{{task_id}}"),
        ("delete", f"{api}/tasks/{{task_id}}"),
        ("get", f"{api}/tasks/my/dashboard"),
        ("patch", f"{api}/tasks/{{task_id}}/status"),
        ("post", f"{api}/tasks/{{task_id}}/clone"),
        ("post", f"{api}/tasks/{{task_id}}/comments"),
        ("get", f"{api}/tasks/{{task_id}}/comments"),
        ("patch", f"{api}/tasks/{{task_id}}/comments/{{comment_id}}/approval"),
        ("post", f"{api}/tasks/{{task_id}}/progress-reports"),
        ("get", f"{api}/tasks/{{task_id}}/progress-reports"),
        ("post", f"{api}/tasks/{{task_id}}/proofs"),
        ("patch", f"{api}/tasks/{{task_id}}/proofs/{{proof_id}}"),
        ("get", f"{api}/tasks/{{task_id}}/proofs"),
        ("post", f"{api}/tasks/{{task_id}}/dependencies"),
        ("get", f"{api}/tasks/{{task_id}}/audit"),
        ("get", f"{api}/tasks/{{task_id}}/conflicts"),
        ("get", f"{api}/dashboard/overview"),
        ("get", f"{api}/dashboard/projects/stats"),
        ("get", f"{api}/dashboard/users/workload"),
        ("get", f"{api}/dashboard/leaderboard"),
        ("get", f"{api}/dashboard/overdue"),
        ("get", f"{api}/dashboard/tasks/calendar"),
    ]

    if settings.ENVIRONMENT == "local":
        operations.append(("post", f"{api}/private/users/"))

    return operations


def test_openapi_contains_all_expected_endpoints(client: TestClient) -> None:
    """Smoke check: OpenAPI schema exposes all expected backend endpoints."""
    r = client.get(f"{settings.API_V1_STR}/openapi.json")
    assert r.status_code == 200
    schema = r.json()

    paths = schema.get("paths", {})
    assert isinstance(paths, dict)

    missing: list[str] = []
    for method, path in expected_api_operations():
        path_item = paths.get(path)
        if not path_item:
            missing.append(f"{method.upper()} {path} (path missing)")
            continue
        if method.lower() not in path_item:
            missing.append(f"{method.upper()} {path} (method missing)")

    assert not missing, "Missing expected endpoints:\n" + "\n".join(missing)


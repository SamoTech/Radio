"""Regression tests for Pages artifact identity and safe deployment retries."""
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.error import HTTPError, URLError

SPEC = importlib.util.spec_from_file_location('pages_deploy', Path(__file__).resolve().parents[1] / 'scripts/pages_deploy.py')
pages = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pages)
ART = {'id': 42, 'name': 'github-pages-17-2', 'expired': False, 'size_in_bytes': 123,
       'workflow_run': {'id': 17, 'head_sha': 'a' * 40}}
LIST = {'total_count': 1, 'artifacts': [ART]}


class PagesArtifactTests(unittest.TestCase):
    def wait(self, api, **kw):
        self.sleeps = []
        return pages.wait_for_artifact(api, '/repos/o/r', 17, ART['name'], 42,
                                       sleep=self.sleeps.append, log=lambda _: None, **kw)

    def test_three_consistent_observations_with_backoff(self):
        api = Mock(); api.request.side_effect = [LIST, ART] * 3
        self.assertEqual(self.wait(api), ART)
        self.assertEqual(self.sleeps, [2, 4])
        self.assertEqual(api.request.call_count, 6)

    def test_absent_then_visible_and_transient_reset_stability(self):
        api = Mock(); api.request.side_effect = [LIST, ART, pages.RetryableRead('503'),
                                                {'total_count': 0, 'artifacts': []}] + [LIST, ART] * 3
        self.assertEqual(self.wait(api), ART)
        self.assertEqual(len(self.sleeps), 5)

    def test_missing_exhausts_bounded_attempts(self):
        api = Mock(); api.request.return_value = {'total_count': 0, 'artifacts': []}
        with self.assertRaisesRegex(pages.DeploymentError, 'exhausted 4'):
            self.wait(api, attempts=4)
        self.assertEqual(api.request.call_count, 4)
        self.assertEqual(self.sleeps, [2, 4, 8])

    def test_wrong_expired_empty_cross_run_or_ambiguous_fail_immediately(self):
        cases = []
        for field, value in [('id', 99), ('expired', True), ('size_in_bytes', 0),
                             ('workflow_run', {'id': 9})]:
            bad = copy.deepcopy(LIST); bad['artifacts'][0][field] = value; cases.append(bad)
        bad = copy.deepcopy(LIST); bad['artifacts'].append(ART); cases.append(bad)
        cases.append({'total_count': 101, 'artifacts': [ART]})
        cases.append({'artifacts': [ART]})
        for listing in cases:
            with self.subTest(listing=listing):
                api = Mock(); api.request.return_value = listing
                with self.assertRaises(pages.DeploymentError): self.wait(api)
                self.assertEqual(api.request.call_count, 1)
                self.assertEqual(self.sleeps, [])

    def test_direct_id_metadata_disagreement_fails(self):
        api = Mock(); bad = dict(ART, name='old'); api.request.side_effect = [LIST, bad]
        with self.assertRaisesRegex(pages.DeploymentError, 'disagree'):
            self.wait(api)

    def test_permission_denial_never_retries(self):
        api = Mock(); api.request.side_effect = pages.DeploymentError('403')
        with self.assertRaisesRegex(pages.DeploymentError, '403'): self.wait(api)
        self.assertEqual(api.request.call_count, 1)


class PagesDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(); self.addCleanup(self.temp.cleanup)
        self.state = Path(self.temp.name) / 'state.json'
        self.sleeps = []

    def deploy(self, api, **kw):
        return pages.deploy(api, '/repos/o/r', 42, 'b' * 40, 'secret-token', self.state,
                            sleep=self.sleeps.append, log=lambda _: None, **kw)

    def test_one_post_then_bounded_status_reads_with_same_deployment_id(self):
        api = Mock(); api.request.side_effect = [{'id': 'd123', 'page_url': 'https://o.github.io/r/'},
            pages.RetryableRead('404'), {'status': 'deployment_in_progress'}, {'status': 'succeed'}]
        result = self.deploy(api)
        self.assertEqual(result['id'], 'd123')
        self.assertEqual([c.args[0] for c in api.request.call_args_list], ['POST', 'GET', 'GET', 'GET'])
        self.assertEqual(self.sleeps, [2, 4])
        payload = api.request.call_args_list[0].args[2]
        self.assertEqual(payload['pages_build_version'], 'b' * 40)
        self.assertNotEqual(payload['pages_build_version'], ART['workflow_run']['head_sha'])
        self.assertNotIn('secret-token', self.state.read_text())

    def test_every_documented_nonterminal_status_is_polled_until_success(self):
        api = Mock()
        values = ['deployment_in_progress', 'syncing_files', 'finished_file_sync',
                  'updating_pages', 'purging_cdn', 'deployment_attempt_error', 'succeed']
        api.request.side_effect = [{'id': 'abc123'}] + [{'status': v} for v in values]
        self.deploy(api)
        self.assertEqual(api.request.call_count, len(values) + 1)
        self.assertEqual(sum(c.args[0] == 'POST' for c in api.request.call_args_list), 1)

    def test_official_page_url_forms_and_unsafe_urls(self):
        for value, expected in [('samotech.github.io/Radio/', 'https://samotech.github.io/Radio/'),
                                ('https://samotech.github.io/Radio/', 'https://samotech.github.io/Radio/')]:
            self.assertEqual(pages.production_page_url(value), expected)
        for value in [None, '', 'http://example.com', 'https://u:p@example.com',
                      'https://example.com/\nkey=bad', 'https://example.com/#bad']:
            with self.subTest(value=value):
                with self.assertRaises(pages.DeploymentError): pages.production_page_url(value)

    def test_uncertain_post_never_retries_and_journal_prevents_repeat(self):
        api = Mock(); api.request.side_effect = pages.DeploymentError('timeout')
        with self.assertRaisesRegex(pages.DeploymentError, 'timeout'): self.deploy(api)
        with self.assertRaisesRegex(pages.DeploymentError, 'journal already exists'): self.deploy(api)
        self.assertEqual(api.request.call_count, 1)

    def test_terminal_unknown_and_invalid_creation_fail_without_recreation(self):
        for status in ['deployment_failed', 'deployment_content_failed', 'unexpected']:
            with self.subTest(status=status):
                self.state.unlink(missing_ok=True)
                api = Mock(); api.request.side_effect = [{'id': 1}, {'status': status}]
                with self.assertRaises(pages.DeploymentError): self.deploy(api)
                self.assertEqual(api.request.call_count, 2)
        self.state.unlink(missing_ok=True)
        api = Mock(); api.request.return_value = {}
        with self.assertRaisesRegex(pages.DeploymentError, 'valid deployment ID'): self.deploy(api)
        self.assertEqual(api.request.call_count, 1)

    def test_status_timeout_never_recreates(self):
        api = Mock(); api.request.side_effect = [{'id': 123}] + [{'status': 'queued'}] * 3
        with self.assertRaisesRegex(pages.DeploymentError, 'exhausted 3'): self.deploy(api, attempts=3)
        self.assertEqual(api.request.call_count, 4)


class PagesAPITests(unittest.TestCase):
    def test_only_transient_gets_retry_and_post_never_retries(self):
        for method in ['GET', 'POST']:
            for code in [401, 403, 404, 422, 429, 500, 502, 503, 504]:
                with self.subTest(method=method, code=code):
                    opener = Mock(side_effect=HTTPError('https://api.github.com', code, 'failure', {}, None))
                    api = pages.API('https://api.github.com', 'secret', opener)
                    expected = pages.RetryableRead if method == 'GET' and code in pages.TRANSIENT_HTTP else pages.DeploymentError
                    with self.assertRaises(expected) as ctx: api.request(method, '/repos/o/r/pages/deployments')
                    self.assertNotIn('secret', str(ctx.exception))
                    self.assertEqual(opener.call_count, 1)

    def test_read_transport_failure_retryable_post_uncertain(self):
        api = pages.API('https://api.github.com', 'secret', Mock(side_effect=URLError('sensitive')))
        with self.assertRaises(pages.RetryableRead): api.request('GET', '/safe')
        with self.assertRaisesRegex(pages.DeploymentError, 'outcome unknown') as ctx: api.request('POST', '/safe', {'oidc_token': 'secret'})
        self.assertNotIn('sensitive', str(ctx.exception))

    def test_oidc_preserves_default_audience_and_never_logs_token(self):
        response = Mock(); response.__enter__ = Mock(return_value=io.BytesIO(b'{"value":"jwt-secret"}')); response.__exit__ = Mock()
        opener = Mock(return_value=response)
        env = {'ACTIONS_ID_TOKEN_REQUEST_URL': 'https://oidc.example/token?api-version=2', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN': 'request-secret'}
        self.assertEqual(pages.oidc_token(env, opener), 'jwt-secret')
        self.assertEqual(opener.call_args.args[0].full_url, env['ACTIONS_ID_TOKEN_REQUEST_URL'])


if __name__ == '__main__': unittest.main()

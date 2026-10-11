// #502 — RFC 8414 authorization-server metadata for the Claude connector.
// CIMD only: no registration_endpoint.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
	const o = url.origin;
	return json({
		issuer: o,
		authorization_endpoint: `${o}/oauth/authorize`,
		token_endpoint: `${o}/oauth/token`,
		response_types_supported: ['code'],
		grant_types_supported: ['authorization_code', 'refresh_token'],
		code_challenge_methods_supported: ['S256'],
		token_endpoint_auth_methods_supported: ['none'],
		client_id_metadata_document_supported: true,
		authorization_response_iss_parameter_supported: true
	});
};

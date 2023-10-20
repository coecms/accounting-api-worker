/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const allowedHosts = [ 'http://localhost:5173', 'https://climate-cms.org' ];
const api_server = "https://clex-cms-accounting.azurewebsites.net/api/";

const handler: ExportedHandler = {
	async fetch(request: Request) {

		const url = new URL(request.url)

		if(request.method.toUpperCase() === 'OPTIONS') {
			let responseHeaders = setCorsHeaders(new Headers(),request.headers.get('Origin'), url.pathname);
			return new Response(null, {headers:responseHeaders,status:204});
		} else if ( url.pathname.startsWith("/v0/auth") ) {
			// Handle auth
			const init = {
				method: request.method,
				headers: request.headers,
				body: await request.arrayBuffer()
			}
			const newRequest = new Request(api_server + url.pathname,init);
			const response = await fetch(newRequest);
			return response;
		} else if ( request.method.toUpperCase() !== 'GET' ) {
			return new Response(null,{status:405});
		}

		if ( request.headers.get("Authorization") == null ) {
			return new Response(null,{status:401})
		}

		// Check auth
		const auth_init = {
			method: request.method,
			headers: request.headers,
			cf: {
				cacheEverything: true,
				// Don't expect these to change much
				cacheTtl: 604800
			}
		}
		const auth_response = await fetch(api_server + '/v0/checkauth?key='+ request.headers.get('Authorization'),auth_init)
		if ( auth_response.status != 204 ) {
			return auth_response;
		}

		// Cache until next update time
		const roundTimes = [1, 7, 13, 19];

		const now = new Date();
		const outdate = new Date();

		// Round hours to next entry in roundTimes
		if ( now.getUTCMinutes() >= 30 || !roundTimes.includes(now.getUTCHours()) ) {
			var outhour = Math.floor((((now.getUTCHours()+5)%24)+24)%24/6)*6+1;
		} else {
			outhour = now.getUTCHours();
		}
		if ( outhour <= 1  && now.getUTCHours() >= 19 ) {
			outdate.setUTCDate(outdate.getUTCDate()+1);
		}
		outdate.setUTCHours(outhour);
		outdate.setUTCMinutes(30);
		outdate.setUTCSeconds(0);

		const init = {
			method: request.method,
			headers: request.headers,
			cf: {
				cacheEverything: true,
				cacheTtl: Math.floor(( outdate.getTime() - now.getTime())/1000)
			 }
		}
		const response = await fetch(api_server + url.pathname + url.search,init);
		return response;
	}

}

function setCorsHeaders(headers: Headers, hostname: string|null, resource: string) {
	/// Requests into this worker are allowed from two places
	if ( !hostname ) {
		return headers;
	}
	if ( allowedHosts.includes(hostname) ) {
		headers.set('Access-Control-Allow-Origin', hostname);
		if ( resource.startsWith("/v0/auth") ) {
			headers.set('Access-Control-Allow-Methods', 'POST');
			headers.set('Access-Control-Allow-Headers','Content-Range, Content-Type, Content-Length');
		} else {
			headers.set('Access-Control-Allow-Methods', 'GET');
			headers.set('Access-Control-Allow-Headers', 'Content-Range, Content-Type, Content-Length, Range, Authorization');
		}
		headers.set('Access-Control-Expose-Headers','Content-Range');
		headers.set('Access-Control-Max-Age', '86400');
	}
	return headers;
}

export default handler;
const headers = {
	Authorization: `Bearer ${Deno.env.get('NOTION_API_KEY')}`,
	"Content-Type": "application/json",
	"Notion-Version": "2021-08-16",
}

const API = async (path, data) => {
	const params = { method: "POST", headers, body: JSON.stringify(data) }
	const res = await fetch(`https://api.notion.com/v1/${path}`, params)

	if (res.status < 200 || res.status > 299) {
		const body = await res.text()
		try {
			const { code, message } = JSON.parse(body)
			console.log(path, data, { status: res.status, code, message })
			throw Error(`API Error: ${code} - ${message}`)
		} catch {
			console.log(path, data, body)
			throw Error(`API Error: ${res.status} - ${res.statusText}`)
		}
	}

	return res.json()
}

const fetchDatabase = async (databaseId, cursor) => {
	const params = { start_cursor: cursor, page_size: 100 }
	const response = await API(`databases/${databaseId}/query`, params)
	if (!response.next_cursor) return response.results
	return [
		...response.results,
		await fetchDatabase(databaseId, response.next_cursor),
	]
}

addEventListener("fetch", async event => {
	const tickets = await fetchDatabase("4dcfca5fe4d14df08ad14c24c41d8206")
	// Return JSON.
	event.respondWith(
		new Response(JSON.stringify(tickets, null, 2), {
			headers: { "content-type": "application/json" },
		}),
	)
})

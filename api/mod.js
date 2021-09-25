const API_HEADERS = {
	Authorization: `Bearer ${Deno.env.get("NOTION_API_KEY")}`,
	"Content-Type": "application/json",
	"Notion-Version": "2021-08-16",
}

const API = async (path, data) => {
	const body = data && JSON.stringify(data)
	const params = { method: "POST", headers: API_HEADERS, body }
	const res = await fetch(`https://api.notion.com/v1/${path}`, params)

	if (res.status < 200 || res.status > 299) {
		const body = await res.text()
		try {
			const { code, message } = JSON.parse(body)
			console.log(path, data, { status: res.status, code, message })
			const err = Error(`API Error: ${code} - ${message}`)
			err.status = res.status
			throw err
		} catch {
			console.log(path, data, body)
			const err = Error(`API Error: ${res.status} - ${res.statusText}`)
			err.status = res.status
			throw err
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
		...(await fetchDatabase(databaseId, response.next_cursor)),
	]
}

const getText = item => item.title?.[0]?.plain_text
const getName = item => item.name
const getSprint = item => item?.multi_select.map(getName) || []
const formatFeature = data => ({
	id: data.id,
	url: data.url,
	createdAt: new Date(data.created_time).getTime(),
	updatedAt: new Date(data.last_edited_time).getTime(),
	title: getText(data.properties["Feature"]),
	owner: data.properties["Owner"]?.people.map(getName).filter(Boolean),
	sprints: [
		...new Set(
			data.properties["Linked sprints"]?.rollup?.array.flatMap(getSprint),
		),
	],
	archived: data.archived || undefined,
	type: "feature",
	linked: data.properties["Linked tasks"]?.rollup?.array
		.map(getText)
		.filter(Boolean),
})

const formatTask = data => ({
	id: data.id,
	url: data.url,
	createdAt: new Date(data.created_time).getTime(),
	updatedAt: new Date(data.last_edited_time).getTime(),
	title: getText(data.properties["Task"]),
	owner: data.properties["Owner"]?.people.map(getName).filter(Boolean),
	sprints: [
		...new Set(
			data.properties["Linked sprints"]?.rollup?.array.flatMap(getSprint),
		),
	],
	archived: data.archived || undefined,
	type: "task",
})

const formatBug = data => ({
	id: data.id,
	url: data.url,
	createdAt: new Date(data.created_time).getTime(),
	updatedAt: new Date(data.last_edited_time).getTime(),
	title: getText(data.properties["Issue"]),
	owner: data.properties["Owner"]?.people.map(getName).filter(Boolean),
	sprints: [
		...new Set(
			data.properties["Linked sprints"]?.rollup?.array.flatMap(getSprint),
		),
	],
	archived: data.archived || undefined,
	type: "bug",
})

const HTML = await Deno.readTextFile(`${Deno.cwd()}/dashboard.html`)
const updateCache = async () => {
	const [bugs, tasks, features] = await Promise.all([
		fetchDatabase("734a0ee4c78f487fb66deede64addfff"),
		fetchDatabase("1aa5ea4440534585ab4ead4396d27725"),
		fetchDatabase("4dcfca5fe4d14df08ad14c24c41d8206"),
	])

	const tickets = JSON.stringify([
		...features.map(formatFeature),
		...tasks.map(formatTask),
		...bugs.map(formatBug),
	])

	const at = String(Date.now())
	const body = HTML.replace("window.$TICKETS", tickets).replace(
		"window.$CACHE_AT",
		at,
	)

	localStorage.at = at
	localStorage.tickets = tickets
	localStorage.body = body
	return { tickets, at, body }
}

const initOrLoadCache = () => {
	const at = Number(localStorage.at) || 0
	return at ? { at, tickets: localStorage.tickets } : updateCache()
}

const makeTicketResponse = ({ tickets, at }) =>
	new Response(localStorage.tickets, {
		headers: {
			"content-type": "application/json",
			"x-cache-at": localStorage.at,
		},
	})

const MIN = 1000 * 60
const handleRequest = async ({ request }) => {
	const type = request.headers.get("content-type")
	const cache = await initOrLoadCache()
	if (!type.includes("application/json")) return new Response(cache.body)

	// rate limit cache update
	return Date.now() - cache.at < MIN
		? makeTicketResponse()
		: updateCache().then(makeTicketResponse)
}

addEventListener("fetch", async event => {
	try {
		event.respondWith(await handleRequest(event))
	} catch (err) {
		event.respondWith(new Response(err.stack, { status: err.status || 500 }))
	}
})

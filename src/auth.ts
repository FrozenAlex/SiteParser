import Axios from "axios";
import { parse, HTMLElement } from "node-html-parser";
import * as qs from "qs";
import {  getRepository, MoreThan } from "typeorm";
import { Cookie } from "./entity/Cookie";

let defaultCredentials = {
	username: process.env.USERNAME,
	password: process.env.PASSWORD,
};

export let fakeHeaders = {
	"User-Agent":
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:75.0) Gecko/20100101 Firefox/75.0",
	Accept: " text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
	"Accept-Language": "ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3",
	"Accept-Encoding": "gzip, deflate",
	DNT: "1",
	Connection: "keep-alive",
	Pragma: "no-cache",
	"Cache-Control": "no-cache",
};

export default async function getAuthCookie({ username, password }) {
	// Get existing
	let cookieRepository = getRepository(Cookie);
	let cookie = await cookieRepository.findOne({
		where: {
			expires: MoreThan(new Date()),
			username: username,
		},
	});
	if (cookie) return cookie;

	// Get the form first
	let response = await Axios.get("http://www.it-starter.ru/content/glavnaya-stranitsa", {
		headers: fakeHeaders
	});

	let sessionCookie = parseSetCookie(response.headers["set-cookie"][0]).value;
	let page = parse(response.data);

	// Get form id TODO: Remake as regex
	let loginForm = (page as HTMLElement).querySelector("#user-login-form")
		.childNodes[1] as HTMLElement;

	let form_build_id = (loginForm.childNodes[7] as HTMLElement).getAttribute("value");

	let success = await Axios.create({
		headers: {
			...fakeHeaders,
			Cookie: `${sessionCookie};`,
			"Content-Type": "application/x-www-form-urlencoded",
			Origin: "http://www.it-starter.ru",
			Referer: "http://www.it-starter.ru/",
		},
		withCredentials: true,
		maxRedirects: 0,
		validateStatus: () => true,
	}).post(
		"http://www.it-starter.ru/content/glavnaya-stranitsa?destination=node/36",
		qs.stringify(
			{
				name: username,
				pass: password,
				op: "Вход в систему",
				form_build_id: form_build_id,
				form_id: "user_login_block",
			},
			{ format: "RFC1738" }
		)
	);
	if (success.headers["set-cookie"]) {
		let cookie = parseSetCookie(success.headers["set-cookie"][1]);
		// Save auth cookie
		await cookieRepository.save({
			username:username,
			expires: cookie.expires,
			value:cookie.value
		})

		return cookie
	}
}

export let parseSetCookie = (cookieString: string) => {
	let split = cookieString.split(";");
	let expires = split[1].match(/(\d\d-\w*-\d{4}\s\d{2}:\d{2}:\d{2}\s\w{3})/g)[0];
	return {
		value: split[0],
		expires: new Date(expires),
	};
};

export async function getPage(
	url = "http://www.it-starter.ru/content/%D0%B0%D0%B3%D1%8320181%D0%BF%D0%BC1",
	credentials = defaultCredentials
) {
	let cookie = await getAuthCookie(credentials);
	let result = await Axios.get(url, {
		headers: {
			...fakeHeaders,
			Cookie: cookie.value,
		},
	});
	return result.data;
}

import { readFileSync } from "fs"
import { parseArticle, parseType, parseArticleList } from "./parsers";

test("parse article", ()=>{
    let file = readFileSync(__dirname + "/../pages/article.html").toString();
    let publicFile = readFileSync(__dirname + "/../pages/openArticle.htm").toString();
    parseArticle(file);
    parseArticle(publicFile);
})

test("parse article list", ()=>{
    let file = readFileSync(__dirname + "/../pages/groupArticleList.htm").toString();
    let publicFile = readFileSync(__dirname + "/../pages/mainArticleList.html").toString();
    parseArticleList(file);
    parseArticleList(publicFile);
})

test("parse page type", ()=>{
    let articleList = readFileSync(__dirname + "/../pages/groupArticleList.htm").toString();
    let article = readFileSync(__dirname + "/../pages/article.html").toString();
    let publicArticleList = readFileSync(__dirname + "/../pages/mainArticleList.html").toString();
    let publicArticle = readFileSync(__dirname + "/../pages/openArticle.htm").toString();
    expect(parseType(articleList)).toBe("articleList")
    expect(parseType(publicArticleList)).toBe("articleList")
    expect(parseType(article)).toBe("article")
    expect(parseType(publicArticle)).toBe("article")
})
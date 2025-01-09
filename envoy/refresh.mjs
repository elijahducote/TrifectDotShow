// Network 
import axios from "axios";

// Utility
import {tabulate, sendHTMLResponse} from "../utility.js";

// API
const gh = axios.create({
  baseURL: "https://api.github.com/repos/elijahducote/trifectshow",
  headers: {
    "Authorization": `Bearer ${process.env.GIT}`,
    "Accept": "application/vnd.github.object+json,text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    "Referer": "https://example.com/",
    "Connection": "keep-alive"
  },
  withCredentials: false
});

exports.handler = async (event, context) => {
  let msg = "",
  status = 2,
  respCode = 500;
  try {
    let isError = false;
    
    await Promise.allSettled(
    [
      gh.get("/commits/main"),
      gh.get("/contents/convoy/important.json")
    ]).then(vow => {
      const {status: commitStatus} = vow[0].value,
      errlog = [];
      
      
      if (commitStatus === 200) {
        const {sha: latestCommit} = vow[0].value.data,
        {status: fileStatus} = vow[1].value;
        
        if (latestCommit && fileStatus === 200) {
          const {content: fileContent, sha: blobHash} = vow[1].value.data,
          jsonObject = JSON.parse(atob(fileContent));
          if (jsonObject.hash === latestCommit) return;
          jsonObject.hash = latestCommit;
          gh.put("/contents/convoy/important.json",
          {
            sha: blobHash,
            content: btoa(JSON.stringify(jsonObject)),
            message: "Update on file contents."
          })
          .catch(err => {
            errlog[errlog.length] = tabulate(`Couldn't update requested file: "${err}"`, errlog.length);
          });
        }
        else errlog[errlog.length] = tabulate("File wasn't able to be reached.", errlog.length);
      }
      else errlog[errlog.length] = tabulate("Unable to fulfill request.", errlog.length);
          
      if (errlog.length !== 0) throw errlog.join();
    }).catch(err => {
      msg = msg + err;
      isError = true;
    });
    
    if (isError) throw new Error(msg);
    else {
      status = 1;
      respCode = 200;
      msg = "Successful!";
    }
  }
  catch (err) {
    status = 0;
    respCode = 400;
  }
  finally {
    return {
      statusCode:respCode,
      headers: {
        "Content-Type": "text/html"
      },
      body:sendHTMLResponse(status,msg)
    };
  }
};
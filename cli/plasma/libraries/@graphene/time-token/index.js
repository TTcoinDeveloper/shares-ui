import assert from "assert"
import crypto from "crypto"
import local_secret from "@graphene/local-secret"
import bs58 from "bs58"

const sha1 = data => crypto.createHash("sha1").update(data).digest('base64')

export const expire_min = ()=> process.env.npm_config__graphene_time_token_expire_min != null ?
    Number(process.env.npm_config__graphene_time_token_expire_min) : 10

/**
    Create a time-based token created by combining the `local_secret` node configuration value and the provided seed parameter.
    
    @arg {string} seed - unique value such as an email address
    @arg {boolean} [include_seed - include this seed in the token as a public value (this is easily visable by
    decoding the token).  If this is `true`, the {@link checkToken} method will not require this seed value.
    @return {string} token - base58 (you will probably need to encode this)
*/
export function createToken(seed, include_seed = true) {
    if( ! seed || typeof seed !== 'string' )
        throw new Error("Missing required parameter: {string} seed")
    
    // Subtract the algorithm create date (14484919) to make the number smaller.
    // Indicating which minute the hash was created lets the validation know
    // without guessing which minute to validate against.
    const now = Math.floor( Date.now()/(100*1000) ) - 14484919
    const now_string = String( now )
    let newToken = crypto.createHash("sha1")
        .update(local_secret())
        .update(now_string)
        .update(seed)
        .digest('base64')
        .substring(0, 10)
    
    newToken += now_string
    if( include_seed ) newToken += '\t' + seed
    
    // // Add outter validation so the a client (without the server's secret) can validate too
    let check = sha1(newToken).substring(0, 5)
    let token = new Buffer(check + newToken, 'binary')
    token = bs58.encode(token)
    return token
}

/** This requires the same `local_secret` used to create the token.
    @arg {string} token - bs58 string token provided by calling {@link createToken}
    @arg {string} [seed = null] - used to create this token or `null` if the token has the seed embedded within
    @arg {number} [expire_min_arg = expire_min()] - `null` for no expiration
    @return {object} result - { valid: boolean, seed: string, error: [null|"unmatched"|"expired"] } 
*/
export function checkToken(token, seed = null, expire_min_arg = expire_min()) {
    try {
        if( ! token || typeof token !== 'string' )
            throw new Error("token should be a string : ", typeof token)
        
        if( expire_min_arg && typeof expire_min_arg !== "number")
            throw new Error("expire_min_arg should be a number")
        
        token = new Buffer(bs58.decode(token)).toString('binary')
        if( ! validDecodedToken(token))
            throw "invalid token"
        
        // remove public validation hash
        token = token.substring(5, token.length)
        
        // server's secret hash
        let raw_token = token.substring(0, 10)
        token = token.substring(10, token.length)
        
        let tab = token.indexOf("\t")
        let then_string = tab !== -1 ? token.substring(0, tab) : token
        let token_seed = tab !== -1 ? token.substring(tab + 1) : seed
        if( ! token_seed || typeof token_seed !== 'string' )
            throw new Error("Missing required parameter or embedded token value: seed")
        
        let then = parseInt(then_string)
        // Subtract the algorithm create date (14484919) to make the number smaller
        let now = Math.floor( Date.now()/(100*1000) ) - 14484919

        if( expire_min_arg != null && (now - then) >= expire_min_arg ) {
            return { valid: false,  seed: null, error: "expired" }
        }
        let token_verify = crypto.createHash("sha1")
            .update(local_secret())
            .update(then_string)
            .update(token_seed)
            .digest('base64')
            .substring(0, 10)
        
        let valid = raw_token === token_verify
        return { valid, seed: valid ? token_seed : null, error: valid ? null : "unmatched" }
    } catch(e) {
        return { valid: false, seed: null, error: e.toString()}
    }
}

/** Anyone can extrat the seed data, the `local_secret` is not required.

     The seed is not encrypted, so the secret used to validate the token is not required to view the seed data.
    
    @return {string} seed data (embedded data) in token or `null` if the token was created without any seed data, or undefined if the token is invalid.
*/
export function extractSeed(token) {
    if( ! token)
        return null
    
    assert.equal(typeof token, "string", "token should be a string")
    
    token = new Buffer(bs58.decode(token)).toString( 'binary' )//array to binary
    if( ! validDecodedToken(token))
        return undefined
    
    // remove public validation hash
    token = token.substring(5, token.length)
    // remove server-validation hash
    token = token.substring(10, token.length)
    
    // numeric time value then optional (\t and seed data)
    let tab = token.indexOf("\t")
    let then_string = tab !== -1 ? token.substring(0, tab) : token
    let token_seed = tab !== -1 ? token.substring(tab + 1) : null
    return token_seed
}

function validDecodedToken(token) {
    assert.equal(typeof token, "string", "token should be a string: ", typeof token)
    let check = token.substring(0, 5)
    token = token.substring(5, token.length)
    return check === sha1(token).substring(0, 5)
}

export function validToken(token) {
    if( ! token)
        return false
    assert.equal(typeof token, "string", "token should be a string: ", typeof token)
    token = new Buffer(bs58.decode(token)).toString('binary')// array to buffer
    return validDecodedToken(token)
}
// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16Verifier {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 1503269319140086162040077356948401257072823675534257832731870190081746304581;
    uint256 constant alphay  = 354933292509896480051346262594534699721926913856560665757705485884006521022;
    uint256 constant betax1  = 12795462034370533210665088380102276806419135453311385023275149419847493007701;
    uint256 constant betax2  = 11277492930183735990000253688954925593795007082713709950607060699496795904270;
    uint256 constant betay1  = 80118384899928618294262028000533413157761184290355368919311450264291740780;
    uint256 constant betay2  = 7237485854336739029714876782528102299622345306468941789797955178166084375489;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 20776899964926249628964536267262585824634053077418979483690157519329337910352;
    uint256 constant deltax2 = 10059447889075199216591871614006210150903829661720953829236378409182779467996;
    uint256 constant deltay1 = 130653944860446672945596194614729177413335237083829688807284833278347842106;
    uint256 constant deltay2 = 12522465609272140606912239777389544207362513634893428533295358767650321460773;

    
    uint256 constant IC0x = 617916041432176223652206916334118898693862440312710101981582482585583955436;
    uint256 constant IC0y = 1776988739392581090612482724004311080129247328986439983689170949376737695273;
    
    uint256 constant IC1x = 18866120019656292623739208482070884143638288505106643710532925322594052560548;
    uint256 constant IC1y = 6213030297910512934755200299789596418903828252625265716039151122875553496450;
    
    uint256 constant IC2x = 14875900908311394780513531402329392094213527833281261645234611115593400205796;
    uint256 constant IC2y = 13317432963191985137605456136046774010482596050584403160853337564914508460558;
    
    uint256 constant IC3x = 5298207983413975923241649413400949694544899743030877613755650438462162182039;
    uint256 constant IC3y = 5739944028172483710626823432976073118260599242236178438101214167798469448309;
    
    uint256 constant IC4x = 9601940263416072471289803865304800126880113640444208444064775693788330752403;
    uint256 constant IC4y = 4800665592385985441993203179635608455932543026436902437477762712035892867510;
    
    uint256 constant IC5x = 6663707012131572014538282174258672986847732091102819638522638684355758964682;
    uint256 constant IC5y = 12933309268968570699717853374928897692909180934605606427254920750975672290808;
    
    uint256 constant IC6x = 14069834684204639554927056648865724081855746438703013792381115845405666909632;
    uint256 constant IC6y = 6459267758915311204590089163358581873611232005546361543426408389998789989719;
    
    uint256 constant IC7x = 6978931628526483412135113433892264727542072384657746893211525749265433421289;
    uint256 constant IC7y = 17436422394434381756965925234465469279743847101159936441529916785403735695117;
    
    uint256 constant IC8x = 17695406446480959100656081658231395507294665588703366938892318225944149571208;
    uint256 constant IC8y = 7173008766995881337791441607662037778082190127940186862464510688678916335522;
    
    uint256 constant IC9x = 18342054857968113188790521990563730414115577705619891647149485537862018653535;
    uint256 constant IC9y = 5320074859286045636604413242181742740386259390299771705065422879271627085527;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[9] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
